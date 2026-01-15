# AWS Lambda Image Processor

A Go-based AWS Lambda function that processes images uploaded to S3, detects objects using AWS Rekognition, and stores the results in DynamoDB.

## Architecture

```
S3 (Image Upload) → Lambda → Rekognition (DetectLabels) → DynamoDB
```

## Features

- **S3 Trigger**: Automatically triggered by S3 PutObject events
- **Image Analysis**: Uses AWS Rekognition to detect labels/objects in images
- **Metadata Storage**: Saves image metadata and detected labels to DynamoDB
- **Structured Logging**: Uses Go's `slog` package for CloudWatch-friendly JSON logs

## Prerequisites

- Go 1.21+
- AWS CLI configured with appropriate credentials
- AWS resources:
  - S3 bucket for source images
  - DynamoDB table with partition key `image_key` (String)
  - IAM role with permissions for S3, Rekognition, and DynamoDB

## Project Structure

```
.
├── main.go          # Lambda handler and AWS service integrations
├── go.mod           # Go module dependencies
├── Makefile         # Build and deployment commands
└── README.md        # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DYNAMODB_TABLE_NAME` | Name of the DynamoDB table to store results | `image-labels` |

## Building

```bash
# Build for ARM64 (recommended for Graviton2)
make build

# Build for x86_64
make build-amd64
```

## Deployment

1. **Create the DynamoDB table**:
```bash
aws dynamodb create-table \
  --table-name image-labels \
  --attribute-definitions AttributeName=image_key,AttributeType=S \
  --key-schema AttributeName=image_key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

2. **Create the Lambda function**:
```bash
LAMBDA_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/YOUR_ROLE make create-function
```

3. **Configure S3 trigger**:
```bash
aws s3api put-bucket-notification-configuration \
  --bucket YOUR_BUCKET_NAME \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:REGION:ACCOUNT_ID:function:image-processor",
      "Events": ["s3:ObjectCreated:Put"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {"Name": "suffix", "Value": ".jpg"},
            {"Name": "suffix", "Value": ".png"}
          ]
        }
      }
    }]
  }'
```

4. **Update the function code**:
```bash
make build
make deploy
```

## IAM Policy

The Lambda execution role needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectLabels"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/image-labels"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## DynamoDB Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| `image_key` (PK) | String | S3 object key |
| `bucket_name` | String | Source S3 bucket |
| `image_size` | Number | Image size in bytes |
| `processed_at` | String | ISO 8601 timestamp |
| `detected_labels` | List | Array of detected labels with name and confidence |

## Example Output

```json
{
  "image_key": "photos/sunset.jpg",
  "bucket_name": "my-image-bucket",
  "image_size": 2048576,
  "processed_at": "2026-01-15T13:26:29Z",
  "detected_labels": [
    {"name": "Sunset", "confidence": 98.5},
    {"name": "Sky", "confidence": 97.2},
    {"name": "Nature", "confidence": 95.8}
  ]
}
```

## License

MIT
