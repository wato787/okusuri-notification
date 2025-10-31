output "lambda_function_name" {
  description = "Lambda関数名"
  value       = aws_lambda_function.notification_function.function_name
}

output "lambda_function_arn" {
  description = "Lambda関数ARN"
  value       = aws_lambda_function.notification_function.arn
}

output "lambda_function_invoke_arn" {
  description = "Lambda関数のInvoke ARN"
  value       = aws_lambda_function.notification_function.invoke_arn
}

