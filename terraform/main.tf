terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

# IAMロール: Lambda実行用
resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.function_name}-role"
  }
}

# IAMポリシー: CloudWatch Logsへの書き込み権限（基本実行ロール）
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAMポリシー: SSM Parameter Storeからの読み取り権限
resource "aws_iam_role_policy" "lambda_ssm_read" {
  name = "${var.function_name}-ssm-read-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          aws_ssm_parameter.vapid_public_key.arn,
          aws_ssm_parameter.vapid_private_key.arn,
          aws_ssm_parameter.push_subscription.arn,
          aws_ssm_parameter.user_id.arn
        ]
      }
    ]
  })
}

# SSM Parameter: VAPID公開鍵
resource "aws_ssm_parameter" "vapid_public_key" {
  name  = "${var.ssm_parameter_prefix}/vapid-public-key"
  type  = "SecureString"
  value = var.vapid_public_key

  tags = {
    Name = "${var.function_name}-vapid-public-key"
  }
}

# SSM Parameter: VAPID秘密鍵
resource "aws_ssm_parameter" "vapid_private_key" {
  name  = "${var.ssm_parameter_prefix}/vapid-private-key"
  type  = "SecureString"
  value = var.vapid_private_key

  tags = {
    Name = "${var.function_name}-vapid-private-key"
  }
}

# SSM Parameter: Web Pushサブスクリプション
resource "aws_ssm_parameter" "push_subscription" {
  name  = "${var.ssm_parameter_prefix}/push-subscription"
  type  = "SecureString"
  value = var.push_subscription

  tags = {
    Name = "${var.function_name}-push-subscription"
  }
}

# Lambda関数
resource "aws_lambda_function" "notification_function" {
  filename      = "${path.module}/../${var.lambda_zip_file}"
  function_name = var.function_name
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  source_code_hash = filebase64sha256("${path.module}/../${var.lambda_zip_file}")

  environment {
    variables = {
      VAPID_PUBLIC_KEY  = aws_ssm_parameter.vapid_public_key.value
      VAPID_PRIVATE_KEY = aws_ssm_parameter.vapid_private_key.value
      PUSH_SUBSCRIPTION = aws_ssm_parameter.push_subscription.value
    }
  }

  tags = {
    Name = var.function_name
  }
}

