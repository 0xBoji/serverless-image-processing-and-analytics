output "s3_bucket_name" {
  value = aws_s3_bucket.image_bucket.id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.image_labels.name
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.s3_distribution.domain_name
}

output "lambda_processor_name" {
  value = aws_lambda_function.image_processor.function_name
}

output "lambda_api_name" {
  value = aws_lambda_function.image_api.function_name
}

output "api_endpoint" {
  description = "API Gateway Endpoint URL"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}
