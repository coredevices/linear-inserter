import { LinearClient } from '@linear/sdk';

interface Env {
  LINEAR_API_KEY: string;
  TEAM_KEY: string;
  ASSIGNEE_USERNAME: string;  // Linear username/slug
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

const MAX_FILE_SIZE = 9.9 * 1024 * 1024; // 9.9MB in bytes

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
  const uploadPayload = await linearClient.fileUpload(file.type, file.name, file.size);

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

async function formatIssueBody(bugReport: BugReport, apiKey: string): Promise<string> {
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
    const uploadPromises = bugReport.attachments.map(file => uploadAttachment(apiKey, file));
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

async function createLinearIssue(apiKey: string, teamKey: string, assigneeUsername: string, bugReport: BugReport, files?: FormData) {
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

  const description = await formatIssueBody(bugReport, apiKey);
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

      console.error('Environment variables:', {
        ASSIGNEE_USERNAME: env.ASSIGNEE_USERNAME,
        TEAM_KEY: env.TEAM_KEY,
        LINEAR_API_KEY: env.LINEAR_API_KEY ? '[REDACTED]' : 'undefined'
      });

      // Create issue in Linear
      const result = await createLinearIssue(env.LINEAR_API_KEY, env.TEAM_KEY, env.ASSIGNEE_USERNAME, bugReport, files);

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
