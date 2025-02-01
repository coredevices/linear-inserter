#!/bin/bash

# Read and escape the example files for JSON
SUMMARY=$(cat summary.txt | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
LOGS=$(cat latest.log.txt | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

# Create JSON payload
JSON_DATA=$(cat <<EOF
{
  "bugReportDetails": "App crashed while trying to create a note in Notion after voice command",
  "username": "John Developer",
  "email": "john.dev@example.com",
  "timezone": "Europe/London",
  "summary": ${SUMMARY},
  "latestLogs": ${LOGS}
}
EOF
)

# Send test bug report
curl -X POST \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA" \
  http://localhost:8787  # Replace with your worker URL when deployed

echo # Print newline after response
