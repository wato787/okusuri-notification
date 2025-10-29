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
2. VAPID鍵を確認
3. 固定メッセージ（「お薬の時間です」）を使用してWeb Push通知を送信

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
- ✅ Web Push通知送信機能（Cloudflare Workers対応）
- ✅ 1ユーザー固定の簡略化実装
- ✅ 固定メッセージによる通知送信

### 実装完了

- ✅ Web PushプロトコルのCloudflare Workers対応実装
  - Web Crypto APIを使用したネイティブ実装

### 注意事項

- 環境変数から直接Web Pushサブスクリプションを読み込みます
- 通知メッセージは固定メッセージ（「お薬の時間です」）です
- データベースは使用していません（環境変数のみで動作）

## 環境変数

以下の環境変数を設定してください（`.dev.vars`ファイルに記述）：

### 必須

- `VAPID_PRIVATE_KEY`: Web Push用の秘密鍵（**JWK形式のJSON文字列**）

**重要**: `VAPID_PRIVATE_KEY`はJWK形式（JSON文字列）である必要があります。

VAPID鍵の生成方法：

**方法1: 付属のスクリプトを使用（推奨）**

```bash
bun run generate-vapid-key
# または
node scripts/generate-vapid-key.js
```

出力された`VAPID_PRIVATE_KEY`を`.dev.vars`ファイルに設定してください。

**方法2: ブラウザのコンソールで生成**

```javascript
// ブラウザのコンソールで実行
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign']
)
const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
console.log('VAPID_PRIVATE_KEY=' + JSON.stringify(jwk))
```

出力された内容を`.dev.vars`ファイルにコピーしてください。

### 必須

- `PUSH_SUBSCRIPTION`: Web PushサブスクリプションJSON文字列

### 任意（デフォルト値あり）

- `USER_ID`: ユーザーID（デフォルト: `user-1`）

## 参考資料

- [Hono公式ドキュメント](https://hono.dev/)
- [Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)
- [Cloudflare D1公式ドキュメント](https://developers.cloudflare.com/d1/)
- [Bun公式ドキュメント](https://bun.sh/docs)