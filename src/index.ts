import { Hono } from 'hono'

type Env = {
  Bindings: {
    // 環境変数はここに定義（必要に応じて追加）
  }
}

const app = new Hono<Env>()

app.get('/', (c) => {
  return c.json({
    message: 'okusuri-notification service',
    status: 'ok'
  })
})

// 通知送信エンドポイント（今後実装予定）
app.post('/api/notification', async (c) => {
  return c.json({
    message: 'notification endpoint - to be implemented',
    sent_count: 0,
    process_time_ms: 0
  })
})

export default app

