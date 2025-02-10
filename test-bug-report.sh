#!/bin/bash

# Read and escape the example files for JSON
SUMMARY=$(cat summary.txt | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
LOGS=$(cat latest.log.txt | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

# Create JSON payload
JSON_DATA=$(cat <<EOF
{
  "bugReportDetails": "App crashed while trying to create a note in Notion after voice command",
  "username": "John Developer",
  "email": "john.dev@test.com",
  "timezone": "Europe/London",
  "summary": ${SUMMARY},
  "latestLogs": ${LOGS}
}
EOF
)

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
JSON_FILE="$TEMP_DIR/bug_report.json"

# Save JSON to the temporary file
echo "$JSON_DATA" > "$JSON_FILE"

# Send test bug report with attachments using multipart/form-data
curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "json=@$JSON_FILE;type=application/json" \
  -F "screenshot=@11mb-example.jpg;type=image/jpg" \
  "${WORKER_URL:-http://localhost:8787}"

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo # Print newline after response
