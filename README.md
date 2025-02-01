# Linear Issue Creator

A Cloudflare Worker that receives bug reports and creates issues in Linear via their GraphQL API. Designed to handle detailed bug reports from mobile applications, including system information and logs.

## Features

- Creates Linear issues with formatted markdown content
- Handles multiline content (logs, system information)
- Supports timezone-aware timestamps
- Properly escapes and formats large text blocks
- Truncates long titles while preserving full content in the description

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your Linear API key and team key as secrets:
```bash
# Get your API key from Linear (Settings -> API -> Create Key)
wrangler secret put LINEAR_API_KEY
# When prompted, paste your Linear API key

# Set your Linear team key (e.g., "ENG" for Engineering team)
wrangler secret put TEAM_KEY
# When prompted, paste your Linear team key
```

3. For local development:
   - Copy `.dev.vars.example` to `.dev.vars`
   - Update `.dev.vars` with your Linear API key and team key
   - The `.dev.vars` file is gitignored to prevent committing credentials

4. Deploy the worker:
```bash
npm run deploy
```

## Testing

Use the provided test script to create a test issue:

```bash
./test-bug-report.sh
```

The script uses example data from `summary.txt` and `latest.log.txt` to demonstrate the formatting of system information and logs.

## API Usage

### Request Format

Send a POST request with JSON body:

```json
{
  "bugReportDetails": "string (required) - First 60 chars become issue title",
  "username": "string (required) - Reporter's name",
  "email": "string (required) - Reporter's email",
  "summary": "string (required) - Device and system information",
  "latestLogs": "string (required) - Application logs",
  "timezone": "string (required) - IANA timezone identifier (e.g., 'Europe/London', 'America/New_York')"
}
```

### Issue Format

The worker creates Linear issues with the following markdown structure:

```markdown
### Reporter
**Name:** username
**Email:** email
**Reported:** January 31, 2025, 11:23:51 PM GMT (Local) / January 31, 2025, 03:23:51 AM UTC

### Problem
[Full bug report details]

### Summary
```
[Device and system information]
```

### Latest Logs
```
[Application logs]
```
```

### Response Format

Success (201):
```json
{
  "success": true,
  "issue": {
    "id": "string",
    "title": "string",
    "url": "string"
  }
}
```

Error (400/500):
```json
{
  "error": "Error message"
}
```

## Development

1. Run locally:
```bash
npx wrangler dev --local
```

2. Test with local server:
```bash
./test-bug-report.sh
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

