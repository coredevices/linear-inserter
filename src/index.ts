import { LinearClient } from '@linear/sdk';

interface Env {
  LINEAR_API_KEY: string;
  TEAM_KEY: string;
}

interface BugReport {
  bugReportDetails: string;
  username: string;
  email: string;
  summary: string;
  latestLogs: string;
  timezone: string;  // e.g., "Europe/London"
}

function formatIssueBody(bugReport: BugReport): string {
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

  return `### Reporter
**Name:** ${bugReport.username}
**Email:** ${bugReport.email}
**Reported:** ${localTimestamp} (Local) / ${utcTimestamp} (UTC)

### Problem
${bugReport.bugReportDetails}

### Summary
\`\`\`
${bugReport.summary}
\`\`\`

### Latest Logs
\`\`\`
${bugReport.latestLogs}
\`\`\``;
}

async function createLinearIssue(apiKey: string, teamKey: string, bugReport: BugReport) {
  // Use first 60 chars of bug report details as title
  const title = bugReport.bugReportDetails.slice(0, 60) + (bugReport.bugReportDetails.length > 60 ? '...' : '');
  const description = formatIssueBody(bugReport);
  const linearClient = new LinearClient({ apiKey });

  // Get the team by key
  const team = await linearClient.team(teamKey);
  if (!team) {
    throw new Error(`Could not find team with key: ${teamKey}`);
  }

  // Create the issue
  const issueCreate = await linearClient.createIssue({
    title,
    description,
    teamId: team.id
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
      // Parse the request body
      const bugReport = await request.json() as BugReport;

      // Validate required fields
      if (!bugReport.bugReportDetails) {
        return new Response('Bug report details are required', { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create issue in Linear
      const result = await createLinearIssue(env.LINEAR_API_KEY, env.TEAM_KEY, bugReport);

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
