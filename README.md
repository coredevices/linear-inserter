# Linear Issue Creator

A Cloudflare Worker that receives bug reports and creates issues in Linear via their GraphQL API. Designed to handle detailed bug reports from mobile applications, including system information, logs, and file attachments.

## Features

- Creates Linear issues with formatted markdown content
- Handles multiline content (logs, system information)
- Supports timezone-aware timestamps
- Properly escapes and formats large text blocks
- Truncates long titles while preserving full content in the description
- Supports file attachments up to 50MB
- Displays images inline and provides links for other files
- Automatically assigns issues to a specific user
- Sets initial state to "Triage"

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your Linear secrets:
```bash
# Get your API key from Linear (Settings -> API -> Create Key)
# Format: lin_api_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
wrangler secret put LINEAR_API_KEY
# When prompted, paste your Linear API key

# Set your Linear team key:
# 1. Go to Linear and open your team's page
# 2. The team key is in the URL: linear.app/[team-key]/...
# 3. Or find it in Team Settings -> General -> Key
wrangler secret put TEAM_KEY
# When prompted, paste your team key

# Set the assignee for bug reports:
# 1. Go to your Linear profile settings
# 2. Your ID is in the URL: linear.app/settings/account/[user-id]
# Format: usr_XXXXXXXXXXXXX
wrangler secret put ASSIGNEE_ID
# When prompted, paste your user ID
```

3. For local development:
   - Copy `.dev.vars.example` to `.dev.vars`
   - Update `.dev.vars` with your Linear API key, team key, and assignee ID
   - The `.dev.vars` file is gitignored to prevent committing credentials

4. Deploy the worker:
```bash
npm run deploy
```

## Testing

Use the provided test script to create a test issue:

```bash
# Test with local development server
./test-bug-report.sh

# Test with deployed worker
WORKER_URL="https://your-worker.workers.dev" ./test-bug-report.sh
```

The script uses example data from `summary.txt` and `latest.log.txt` to demonstrate the formatting of system information and logs.

## API Usage

### Request Format

You can send requests in two formats:

#### 1. Simple JSON Request (no attachments)

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

#### 2. Multipart Request (with attachments)

Send a POST request with `multipart/form-data` containing:
- `json`: A file containing the JSON data (same format as above)
- Any number of file attachments (images, videos, etc.)

Example using curl:
```bash
# Create a JSON file
echo '{
  "bugReportDetails": "Bug description here",
  "username": "John Developer",
  "email": "john@example.com",
  "timezone": "America/New_York",
  "summary": "Device info here",
  "latestLogs": "Log content here"
}' > bug_report.json

# Send request with attachments
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "json=@bug_report.json" \
  -F "screenshot=@screenshot.png;type=image/png" \
  -F "video=@recording.mp4;type=video/mp4" \
  https://your-worker.workers.dev
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

### Attachments
![screenshot.png](url)
[recording.mp4](url)

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

### File Size Limits
- Individual files up to 50MB
- Images are displayed inline in the issue
- Videos and other files are added as downloadable links

### Issue Settings
- Initial State: Triage
- Assignee: Set via ASSIGNEE_ID environment variable
- Team: Set via TEAM_KEY environment variable

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

## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
