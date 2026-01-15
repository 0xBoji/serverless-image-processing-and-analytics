variable "aws_region" {
  description = "AWS Region to deploy resources"
  type        = string
  default     = "ap-southeast-2"
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
  default     = "image-processor-source-975050162743"
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  type        = string
  default     = "image-labels"
}
