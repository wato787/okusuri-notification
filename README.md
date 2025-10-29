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

## プロジェクト構造

```
okusuri-notification/
├── src/
│   └── index.ts          # メインエントリーポイント
├── package.json          # 依存関係とスクリプト
├── wrangler.toml         # Cloudflare Workers設定
├── tsconfig.json         # TypeScript設定
└── README.md
```

## 参考資料

- [Hono公式ドキュメント](https://hono.dev/)
- [Cloudflare Workers公式ドキュメント](https://developers.cloudflare.com/workers/)
- [Bun公式ドキュメント](https://bun.sh/docs)