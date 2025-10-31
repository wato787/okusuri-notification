# okusuri-notification

通知を送信するためのサービス。AWS Lambda + Terraformでデプロイできます。`web-push`依存関係はLambda Layerとしてデプロイされ、関数コードと切り離されています。

## 技術スタック

- **Runtime**: Node.js 20 (AWS Lambda)
- **Language**: TypeScript
- **Infrastructure**: Terraform
- **Platform**: AWS Lambda

## セットアップ

### 必要な環境

- [Node.js](https://nodejs.org/) (最新版)
- [Terraform](https://www.terraform.io/) (最新版)
- [mise](https://mise.jdx.dev/) (開発環境管理ツール)
- [AWSアカウント](https://aws.amazon.com/) (デプロイ時)

### インストール

```bash
# miseでツールをインストール
mise install

# 依存関係のインストール
bun install
```

### 環境変数の設定

Terraformで使用する環境変数を設定するため、`terraform/terraform.tfvars` ファイルを作成してください。

```bash
# terraform.tfvars.example をコピーして terraform.tfvars を作成
cp terraform/terraform.tfvars.example terraform/terraform.tfvars

# terraform.tfvars を編集して実際の値を設定
```

### デプロイ

#### 初回デプロイ

```bash
# Terraformを初期化
bun run terraform:init

# 変更内容を確認
bun run terraform:plan

# デプロイ（ビルド + ZIP作成 + Terraform適用）
mise run deploy
```

#### 以降のデプロイ

**コード変更がある場合**（TypeScriptファイルを編集した場合）：
```bash
# 一括デプロイ（ビルド + ZIP作成 + Terraform適用）
mise run deploy
```

または、個別に実行する場合：

```bash
# TypeScriptをコンパイルしてLambda用ZIPファイルを作成（lambda.zip と webpush-layer.zip を生成）
bun run build:lambda

# Terraformで変更内容を確認
bun run terraform:plan

# Terraformでデプロイ
bun run terraform:apply
```

### Lambda Layerについて

- `bun run build:lambda` 実行時に `lambda.zip`（アプリケーションコード）と `webpush-layer.zip`（`web-push`依存関係）が生成されます。
- `terraform apply` では両方のZIPファイルを参照し、`web-push`はLambda Layerとしてデプロイされます。
- Layerの更新内容のみを反映したい場合も、`bun run build:lambda` を再実行して `webpush-layer.zip` を更新してください。

**環境変数のみ変更する場合**（`terraform.tfvars`の値を変更した場合）：
```bash
# Terraformで変更内容を確認
bun run terraform:plan

# Terraformで適用（ビルド・バンドル不要）
bun run terraform:apply
```

環境変数だけの変更の場合は、関数コードの再ビルドは不要なので`terraform apply`だけで更新できます。

## Lambda関数の実行

### 手動実行

```bash
# AWS CLIでLambda関数を実行
aws lambda invoke \
  --function-name okusuri-notification \
  --payload '{}' \
  response.json

# レスポンスを確認
cat response.json
```

**レスポンス**:
```json
{
  "success": true,
  "message": "通知送信成功"
}
```

**処理内容**:
1. SSM Parameter StoreからWeb Pushサブスクリプションを取得
2. VAPID鍵を確認
3. 固定メッセージ（「お薬の時間です」）を使用してWeb Push通知を送信

## プロジェクト構造

```
okusuri-notification/
├── src/
│   ├── index.ts          # Lambdaハンドラー（メインエントリーポイント）
│   ├── types.ts          # 型定義
│   └── utils/
│       └── webpush.ts    # Web Push通知送信
├── scripts/
│   └── bundle-lambda.js  # Lambda用コードZIPとweb-push用レイヤーZIPを作成
├── terraform/
│   ├── main.tf           # Terraformメイン設定
│   ├── variables.tf      # 変数定義
│   ├── outputs.tf       # 出力値定義
│   └── terraform.tfvars.example  # 変数テンプレート
├── package.json          # 依存関係とスクリプト
├── tsconfig.json         # TypeScript設定
├── mise.toml            # mise設定
└── README.md
```

## 実装状況

### 実装済み機能

- ✅ Lambda関数の実装
- ✅ Web Push通知送信機能
- ✅ Terraformによるインフラ管理
- ✅ SSM Parameter Storeによる環境変数管理（無料）
- ✅ 固定メッセージによる通知送信
- ✅ ビルド・デプロイワークフローの自動化

### 注意事項

- SSM Parameter Storeから環境変数を読み込みます
- 通知メッセージは固定メッセージ（「お薬の時間です」）です
- データベースは使用していません（SSM Parameter Storeのみで動作）

## 環境変数（SSM Parameter Store）

以下の環境変数を`terraform/terraform.tfvars`に設定してください。これらはSSM Parameter Store（標準パラメータ、無料）に保存されます：

### 必須

- `vapid_public_key`: Web Push用の公開鍵
- `vapid_private_key`: Web Push用の秘密鍵

VAPID鍵の生成方法：
```bash
npm install -g web-push
web-push generate-vapid-keys
```

### 必須

- `push_subscription`: Web Pushサブスクリプション（JSON文字列）
  - JSON内のダブルクォートは`\"`でエスケープしてください

例：
```
push_subscription = "{\"endpoint\":\"https://...\",\"keys\":{\"p256dh\":\"...\",\"auth\":\"...\"}}"
```

### 任意（デフォルト値あり）

- `user_id`: ユーザーID（デフォルト: `user-1`）

## 利用可能なbunスクリプト

- `bun run build`: TypeScriptをコンパイル
- `bun run build:lambda`: TypeScriptをコンパイルしてLambda用ZIPファイルを作成
- `bun run terraform:init`: Terraformを初期化
- `bun run terraform:plan`: Terraformの変更内容を確認
- `bun run terraform:apply`: Terraformでデプロイ
- `bun run deploy:lambda`: ビルド + バンドル + Terraform適用

## 参考資料

- [AWS Lambda公式ドキュメント](https://docs.aws.amazon.com/lambda/)
- [Terraform公式ドキュメント](https://www.terraform.io/docs)
- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [mise公式ドキュメント](https://mise.jdx.dev/)