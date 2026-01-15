output "s3_bucket_name" {
  value = aws_s3_bucket.image_bucket.id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.image_labels.name
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.s3_distribution.domain_name
}

output "lambda_function_name" {
  value = aws_lambda_function.image_processor.function_name
}
