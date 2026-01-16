#!/bin/bash
# Tail logs from CloudWatch and append to a file for Promtail to read
# Usage: ./tail-logs.sh

LOG_FILE="monitoring/logs/lambda.log"
GROUP_NAME="/aws/lambda/image-api"

echo "Tailing log group $GROUP_NAME to $LOG_FILE..."
echo "Press Ctrl+C to stop."

# Clear old logs
> $LOG_FILE

# Tail logs (requires AWS CLI v2)
aws logs tail "$GROUP_NAME" --follow --format short >> "$LOG_FILE"
