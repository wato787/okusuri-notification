variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "function_name" {
  description = "Lambda関数名"
  type        = string
  default     = "okusuri-notification"
}

variable "lambda_zip_file" {
  description = "Lambda関数のZIPファイルパス（プロジェクトルートからの相対パス）"
  type        = string
  default     = "lambda.zip"
}

variable "ssm_parameter_prefix" {
  description = "SSM Parameter Storeのパラメータプレフィックス"
  type        = string
  default     = "/okusuri-notification"
}

variable "vapid_public_key" {
  description = "VAPID公開鍵"
  type        = string
  sensitive   = true
}

variable "vapid_private_key" {
  description = "VAPID秘密鍵"
  type        = string
  sensitive   = true
}

variable "push_subscription" {
  description = "Web Pushサブスクリプション（JSON文字列）"
  type        = string
  sensitive   = true
}

