# okusuri-notification

通知を送信するためのサービス。Cloudflare Workersを使用して通知を送信します。

## 技術スタック

- **Runtime**: Bun
- **Framework**: Hono
- **Platform**: Cloudflare Workers
- **Language**: TypeScript

## セットアップ

### 必要な環境

- [Bun](https://bun.sh/) (最新版)
- [Cloudflareアカウント](https://dash.cloudflare.com/) (デプロイ時)

### インストール

```bash
# 依存関係のインストール
bun install
```

### 環境変数の設定

開発環境用の環境変数を設定する場合、`.dev.vars` ファイルを作成してください。

```bash
# .dev.vars.example をコピーして .dev.vars を作成
cp .dev.vars.example .dev.vars

# .dev.vars を編集して実際の値を設定
```

### 開発サーバーの起動

```bash
# ローカル開発サーバーを起動
bun run dev
```

サーバー起動後、`http://localhost:8787` にアクセスできます。

### デプロイ

```bash
# Cloudflare Workersにデプロイ
bun run deploy
```

初回デプロイ時は、`wrangler login` でCloudflareアカウントにログインする必要があります。

## APIエンドポイント

### POST /api/notification

全ユーザーに通知を送信します。

**リクエスト**:
```bash
curl -X POST http://localhost:8787/api/notification
```

**レスポンス**:
```json
{
  "message": "notification sent successfully",
  "sent_count": 10,
  "process_time_ms": 1234
}
```

**処理内容**:
1. 環境変数からWeb Pushサブスクリプションを取得
2. 重複送信チェック（5分以内に送信済みはスキップ）
3. 固定メッセージを使用してWeb Push通知を送信

## プロジェクト構造

```
okusuri-notification/
├── src/
│   ├── index.ts          # メインエントリーポイントとルーティング
│   ├── types.ts          # 型定義
│   └── utils/
│       └── webpush.ts    # Web Push通知送信
├── package.json          # 依存関係とスクリプト
├── wrangler.toml         # Cloudflare Workers設定
├── tsconfig.json         # TypeScript設定
├── .dev.vars.example     # 環境変数テンプレート
└── README.md
```

## 実装状況

### 実装済み機能

- ✅ POST `/api/notification` エンドポイント
- ✅ Web Push通知送信機能
- ✅ 重複送信防止（KVストア使用）
- ✅ 1ユーザー固定の簡略化実装
- ✅ 固定メッセージによる通知送信

### 動作確認が必要

- ⚠️ Web Pushライブラリの動作確認
  - `web-push`ライブラリがCloudflare Workersで動作するか要確認
  - 動作しない場合は、Web Pushプロトコルのネイティブ実装が必要

### 注意事項

- 環境変数から直接Web Pushサブスクリプションを読み込みます
- 通知メッセージは固定メッセージです（環境変数`NOTIFICATION_MESSAGE`で変更可能）
- データベースは使用していません（環境変数のみで動作）

## 環境変数

以下の環境変数を設定してください（`.dev.vars`ファイルに記述）：

### 必須

- `VAPID_PUBLIC_KEY`: Web Push用の公開鍵
- `VAPID_PRIVATE_KEY`: Web Push用の秘密鍵

VAPID鍵の生成方法：
```bash
npm install -g web-push
web-push generate-vapid-keys
```

### 必須

- `PUSH_SUBSCRIPTION`: Web PushサブスクリプションJSON文字列

### 任意（デフォルト値あり）

- `USER_ID`: ユーザーID（デフォルト: `user-1`）
- `NOTIFICATION_MESSAGE`: 通知メッセージ（デフォルト: `お薬の時間です`）

## 参考資料

- [Hono公式ドキュメント](https://hono.dev/)
- [Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)
- [Cloudflare D1公式ドキュメント](https://developers.cloudflare.com/d1/)
- [Bun公式ドキュメント](https://bun.sh/docs)