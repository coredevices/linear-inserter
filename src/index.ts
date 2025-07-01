import { LinearClient } from '@linear/sdk';
import LogDehash from '@coredevices/logdehash';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

interface Env {
  LINEAR_API_KEY: string;
  TEAM_KEY: string;
  ASSIGNEE_USERNAME: string;  // Linear username/slug
  LOG_HASH_BUCKET_ENDPOINT: string;  // e.g., "https://s3.example.com"
  LOG_HASH_BUCKET_KEY_ID: string;  // AWS S3 (or compatible) access key ID
  LOG_HASH_BUCKET_SECRET: string;  // AWS S3 secret access key
  LOG_HASH_BUCKET_NAME: string;  // Name of the S3 bucket containing log hash dictionaries
}

interface BugReport {
  bugReportDetails: string;
  username: string;
  email: string;
  summary: string;
  latestLogs: string;
  timezone: string;  // e.g., "Europe/London"
  attachments?: File[];
}

interface BucketConfig {
  endpoint: string;
  keyId: string;
  secret: string;
  bucketName: string;
}

const MAX_FILE_SIZE = 9.9 * 1024 * 1024; // 9.9MB in bytes
const BUILD_ID_REGEX = /Build ID: ([a-z0-9]+)/i;
const GENERATION_REGEX = /^=== Generation: ([0-9]+) ===$/gm;

async function getDictionary(bucketConfig: BucketConfig, buildId: string): Promise<Map<string, any>> {
  const s3Client = new S3Client({
    region: 'us-east-1',
    endpoint: bucketConfig.endpoint,
    credentials: {
      accessKeyId: bucketConfig.keyId,
      secretAccessKey: bucketConfig.secret
    }
  });
  const bucketName = bucketConfig.bucketName;
  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName
  });
  const listResponse = await s3Client.send(listCommand);
  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    console.error('No objects found in bucket:', bucketName);
    return new Map();
  }
  const matches = listResponse.Contents
    .filter((item: any) => item.Key?.startsWith(buildId.toLowerCase()))
    .map((item: any) => item.Key);
  
  if (matches.length === 0) {
    console.error('No matching objects found for Build ID:', buildId);
    return new Map();
  }
  const objectKey = matches[0];
  console.error('Found matching object:', objectKey);
  const getObjectCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey
  });
  const getObjectResponse = await s3Client.send(getObjectCommand);
  if (!getObjectResponse.Body) {
    throw new Error(`Failed to get object ${objectKey} from bucket ${bucketName}`);
  }
  const json = JSON.parse(await getObjectResponse.Body.transformToString());
  if (!json || typeof json !== 'object') {
    throw new Error(`Invalid JSON format in object ${objectKey}`);
  }
  const dict = new Map<string, any>(Object.entries(json));
  console.error(`Loaded dictionary with ${dict.size} entries`);
  return dict;
}

function splitGenerations(logs: string): string[] {
  const generations: string[] = [];
  const lines = logs.split('\n');
  let currentGeneration: string[] = [];
  let currentGenerationNumber: number | null = null;
  for (const line of lines) {
    const match = line.match(GENERATION_REGEX);
    if (match) {
      if (currentGenerationNumber !== null) {
        generations.push(currentGeneration.join('\n'));
      }
      currentGenerationNumber = parseInt(match[1], 10);
      currentGeneration = [];
      currentGeneration.push(line);
    } else if (currentGenerationNumber !== null) {
      currentGeneration.push(line);
    } else {
      console.warn('Line outside of generation:', line);
    }
  }
  if (currentGeneration.length > 0) {
    generations.push(currentGeneration.join('\n'));
  }
  console.error(`Found ${generations.length} generations in logs`);
  return generations;
}

async function dehashLogs(bucketConfig: BucketConfig, logs: string): Promise<string> {
  const generations = splitGenerations(logs);
  const dictCache: Map<string, LogDehash> = new Map();
  let output: string = "";
  for (const generation of generations) {
    const buildId = generation.match(BUILD_ID_REGEX)?.[1];
    if (!buildId) {
      console.error('No Build ID found in generation %d', generation);
      output += generation + '\n'; // Keep original generation if no Build ID
      continue;
    } else {
      console.error('Found Build ID:', buildId);
    }
    let logDehash;
    if (dictCache.has(buildId)) {
      console.error('Using cached dictionary for Build ID:', buildId);
      logDehash = dictCache.get(buildId)!;
    } else {
      console.error('Loading dictionary for Build ID:', buildId);
      const dict = await getDictionary(bucketConfig, buildId);
      if (dict.size === 0) {
        console.error('No dictionary found for Build ID:', buildId);
        output += generation + '\n'; // Keep original generation if no dictionary
        continue;
      }
      logDehash = new LogDehash([dict]);
      dictCache.set(buildId, logDehash);
    }
    const dehashed = generation.split('\n').map(line => {
      return logDehash.dehash(line);
    }).join('\n');
    output += dehashed + '\n';
  }
  console.error('Dehashed logs successfully');
  return output;
}

async function uploadAttachment(apiKey: string, file: File): Promise<string> {
  console.error('Processing file:', {
    name: file.name,
    type: file.type,
    size: file.size
  });

  // For videos, enforce size limit
  if (file.type.startsWith('video/') && file.size > MAX_FILE_SIZE) {
    throw new Error(`Video file ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please compress to under ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB before uploading.`);
  }

  const linearClient = new LinearClient({ apiKey });
  let uploadPayload = await linearClient.fileUpload(file.type, file.name, file.size);

  if (!uploadPayload.success || !uploadPayload.uploadFile) {
    throw new Error("Failed to request upload URL");
  }

  const uploadUrl = uploadPayload.uploadFile.uploadUrl;
  const assetUrl = uploadPayload.uploadFile.assetUrl;

  // Make sure to copy the response headers for the PUT request
  const headers = new Headers();
  headers.set("Content-Type", file.type);
  headers.set("Cache-Control", "public, max-age=31536000");
  uploadPayload.uploadFile.headers.forEach(({ key, value }) => headers.set(key, value));

  try {
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: file
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText
      });
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    console.error('Upload successful');

    // For images that exceed size limit, return a resized URL
    if (file.type.startsWith('image/') && file.size > MAX_FILE_SIZE) {
      // Use Cloudflare Image Resizing to create a resized version
      const resizedUrl = new URL(assetUrl);
      resizedUrl.searchParams.set('width', '1920');
      resizedUrl.searchParams.set('quality', '80');
      resizedUrl.searchParams.set('format', 'auto');
      return resizedUrl.toString();
    }

    return assetUrl;
  } catch (e) {
    console.error(e);
    throw new Error("Failed to upload file to Linear");
  }
}

async function formatIssueBody(bugReport: BugReport, apiKey: string, bucketConfig: BucketConfig): Promise<string> {
  const now = new Date();
  
  // UTC timestamp
  const utcTimestamp = now.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  // User's local timestamp
  const localTimestamp = now.toLocaleString('en-US', {
    timeZone: bugReport.timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  let body = `### Reporter
**Name:** ${bugReport.username}
**Email:** ${bugReport.email}
**Reported:** ${localTimestamp} (Local) / ${utcTimestamp} (UTC)

### Problem
${bugReport.bugReportDetails}

### Summary
\`\`\`
${bugReport.summary}
\`\`\``;

  // Add attachments section if there are any
  if (bugReport.attachments && bugReport.attachments.length > 0) {
    body += '\n\n### Attachments\n';
    const uploadPromises = bugReport.attachments.map( async file => {
      const isWatchLogs = file.name.startsWith('watch-logs') && file.type === 'text/plain';
      const dehashed = isWatchLogs ? await dehashLogs(bucketConfig, await file.text()) : null;
      const uploadFile = dehashed ? new File([dehashed], "dehashed-watch-logs.txt", { type: file.type }) : file;
      return uploadAttachment(apiKey, uploadFile);
    });
    const assetUrls = await Promise.all(uploadPromises);
    
    for (let i = 0; i < bugReport.attachments.length; i++) {
      const file = bugReport.attachments[i];
      const url = assetUrls[i];
      if (file.type.startsWith('image/')) {
        body += `\n\n![${file.name}](${url})\n`;
      } else {
        body += `\n\n[${file.name}](${url})\n`;
      }
    }
  }

  body += `\n\n### Latest Logs
\`\`\`
${bugReport.latestLogs}
\`\`\``;

  return body;
}

async function createLinearIssue(
  apiKey: string,
  teamKey: string,
  assigneeUsername: string,
  bucketConfig: BucketConfig,
  bugReport: BugReport,
  files?: FormData
) {
  // Use first 60 chars of bug report details as title
  const title = bugReport.bugReportDetails.slice(0, 60) + (bugReport.bugReportDetails.length > 60 ? '...' : '');
  // Process any file attachments
  if (files) {
    const attachments: File[] = [];
    // Convert FormData to entries and filter for files
    const entries = Array.from(files as any) as [string, FormDataEntryValue][];
    for (const [key, value] of entries) {
      if (key !== 'json' && value instanceof File) {
        attachments.push(value);
      }
    }
    if (attachments.length > 0) {
      bugReport.attachments = attachments;
    }
  }

  const description = await formatIssueBody(bugReport, apiKey, bucketConfig);
  const linearClient = new LinearClient({ apiKey });

  // List all teams first
  const teams = await linearClient.teams();
  console.error('Available teams:', teams.nodes.map(team => ({
    id: team.id,
    name: team.name,
    key: team.key
  })));

  // Get the team by key
  const team = teams.nodes.find(t => t.key.toLowerCase() === teamKey.toLowerCase());
  if (!team) {
    throw new Error(`Could not find team with key: ${teamKey}. Available teams: ${teams.nodes.map(t => t.key).join(', ')}`);
  }

  // Get the triage state
  const states = await team.states();
  const triageState = states.nodes.find(state => state.name.toLowerCase() === 'triage');
  if (!triageState) {
    throw new Error('Could not find Triage state');
  }

  // Get the assignee by username
  console.error('Getting users list...');
  const { nodes: users } = await linearClient.users({
    first: 100,
    includeArchived: false,
    filter: {
      active: { eq: true }
    }
  });

  if (!users || users.length === 0) {
    throw new Error('No active users found in Linear');
  }

  console.error('Available users:', users.map(user => ({
    id: user.id,
    name: user.name || 'N/A',
    displayName: user.displayName || 'N/A',
    email: user.email || 'N/A'
  })));

  if (!assigneeUsername) {
    throw new Error('ASSIGNEE_USERNAME environment variable is not set');
  }

  console.error('Looking for username:', assigneeUsername);

  // Try different user fields for matching
  const assignee = users.find(user => {
    if (!user) return false;
    const username = assigneeUsername.toLowerCase();
    const name = user.name?.toLowerCase() || '';
    const displayName = user.displayName?.toLowerCase() || '';
    const email = user.email?.toLowerCase() || '';
    return name === username || displayName === username || email.startsWith(username);
  });

  if (!assignee) {
    throw new Error(`Could not find user with username: ${assigneeUsername}`);
  }

  // Check if the reporter is a Linear user and add as subscriber
  const reporterUser = users.find(user => user.email.toLowerCase() === bugReport.email.toLowerCase());
  const subscriberIds = reporterUser ? [reporterUser.id] : [];

  console.error('Found assignee:', {
    id: assignee.id,
    name: assignee.name,
    displayName: assignee.displayName,
    email: assignee.email
  });

  // Create the issue
  const issueCreate = await linearClient.createIssue({
    title,
    description,
    teamId: team.id,
    stateId: triageState.id,
    assigneeId: assignee.id,
    subscriberIds
  });

  if (!issueCreate.success || !issueCreate.issue) {
    throw new Error('Failed to create issue');
  }

  const createdIssue = await issueCreate.issue;
  return {
    success: true,
    issue: {
      id: await createdIssue.id,
      title: await createdIssue.title,
      url: await createdIssue.url
    }
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Log all environment variables at the start
      console.error('Environment:', {
        LINEAR_API_KEY: env.LINEAR_API_KEY ? '[REDACTED]' : 'undefined',
        TEAM_KEY: env.TEAM_KEY || 'undefined',
        ASSIGNEE_USERNAME: env.ASSIGNEE_USERNAME || 'undefined',
        keys: Object.keys(env)
      });

      let bugReport: BugReport;
      let files: FormData | undefined;

      // Check if the request is multipart/form-data
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        files = await request.formData();
        const jsonFile = files.get('json');
        const formDataEntries = Array.from(files as any) as [string, FormDataEntryValue][];
        console.error('Form data fields:', formDataEntries.map(([key]) => key));
        console.error('JSON file type:', jsonFile?.constructor.name);
        
        if (!jsonFile || !(jsonFile instanceof File)) {
          throw new Error('Missing or invalid JSON file in form-data');
        }

        const jsonText = await jsonFile.text();
        console.error('JSON content:', jsonText);
        
        bugReport = JSON.parse(jsonText) as BugReport;
      } else {
        bugReport = await request.json() as BugReport;
      }

      // Validate required fields
      if (!bugReport.bugReportDetails) {
        return new Response('Bug report details are required', { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Block issues from test lab accounts
      if (bugReport.email.toLowerCase().endsWith('@cloudtestlabaccounts.com')) {
        return new Response(JSON.stringify({
          error: 'Issues from test lab accounts are not forwarded'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate environment variables
      if (!env.ASSIGNEE_USERNAME) {
        throw new Error('ASSIGNEE_USERNAME environment variable is not set');
      }
      if (!env.LINEAR_API_KEY) {
        throw new Error('LINEAR_API_KEY environment variable is not set');
      }
      if (!env.TEAM_KEY) {
        throw new Error('TEAM_KEY environment variable is not set');
      }
      if (!env.LOG_HASH_BUCKET_ENDPOINT || !env.LOG_HASH_BUCKET_KEY_ID || !env.LOG_HASH_BUCKET_SECRET || !env.LOG_HASH_BUCKET_NAME) {
        throw new Error('Log hash bucket environment variables are not set');
      }

      console.error('Environment variables:', {
        ASSIGNEE_USERNAME: env.ASSIGNEE_USERNAME,
        TEAM_KEY: env.TEAM_KEY,
        LINEAR_API_KEY: env.LINEAR_API_KEY ? '[REDACTED]' : 'undefined'
      });

      const bucketConfig: BucketConfig = {
        endpoint: env.LOG_HASH_BUCKET_ENDPOINT,
        keyId: env.LOG_HASH_BUCKET_KEY_ID,
        secret: env.LOG_HASH_BUCKET_SECRET,
        bucketName: env.LOG_HASH_BUCKET_NAME,
      };

      // Create issue in Linear
      const result = await createLinearIssue(
        env.LINEAR_API_KEY,
        env.TEAM_KEY,
        env.ASSIGNEE_USERNAME,
        bucketConfig,
        bugReport,
        files
      );

      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error:', error);
      
      return new Response(
        JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Internal server error' 
        }), {
          status: error instanceof Error && error.message.includes('Linear API') ? 400 : 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  },
} satisfies ExportedHandler<Env>;
