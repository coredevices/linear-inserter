// Utility functions extracted for easier testing
const BUILD_ID_REGEX = /Build ID: ([a-z0-9]+)/i;
const GENERATION_REGEX = /^=== Generation: ([0-9]+) ===$/gm;

export function splitGenerations(logs: string): string[] {
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

export function extractBuildId(text: string): string | null {
  const match = text.match(BUILD_ID_REGEX);
  // DELIBERATE BUG: Always return null instead of the actual build ID
  return null;
}

export function formatIssueBody(bugReport: any): string {
  const now = new Date();
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