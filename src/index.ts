import { Hono } from 'hono'
import type { Env, PushSubscription } from './types'
import { sendWebPushNotification } from './utils/webpush'

// 固定通知メッセージ
const DEFAULT_NOTIFICATION_MESSAGE = 'お薬の時間です'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => {
  return c.json({
    message: 'okusuri-notification service',
    status: 'ok',
  })
})

/**
 * 通知送信エンドポイント
 * POST /api/notification
 */
app.post('/api/notification', async (c) => {
  const startTime = Date.now()
  const env = c.env

  try {
    const result = await sendNotification(env)

    const processTime = Date.now() - startTime

    return c.json({
      message: 'notification sent successfully',
      sent_count: result ? 1 : 0,
      process_time_ms: processTime,
    })
  } catch (error) {
    console.error('通知送信エラー:', error)
    return c.json(
      {
        message: 'notification failed',
        error: error instanceof Error ? error.message : 'unknown error',
      },
      500
    )
  }
})

/**
 * 通知送信処理
 */
async function sendNotification(env: Env): Promise<boolean> {
  // サブスクリプションが設定されていない
  if (!env.PUSH_SUBSCRIPTION || env.PUSH_SUBSCRIPTION === '') {
    console.error('PUSH_SUBSCRIPTIONが設定されていません')
    return false
  }

  // サブスクリプションJSONをパース
  let subscription: PushSubscription
  try {
    subscription = JSON.parse(env.PUSH_SUBSCRIPTION)
  } catch (error) {
    console.error('サブスクリプションJSONパースエラー:', error)
    return false
  }

  // VAPID鍵の確認
  if (!env.VAPID_PRIVATE_KEY) {
    console.error('VAPID_PRIVATE_KEYが設定されていません')
    return false
  }

  // 固定メッセージを使用
  const message = DEFAULT_NOTIFICATION_MESSAGE
  const userId = env.USER_ID || 'user-1'

  // Web Push通知を送信
  try {
    await sendWebPushNotification(
      subscription,
      {
        title: 'お薬通知',
        body: message,
        data: {
          messageId: `medication-${Date.now()}`,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          userId,
        },
      },
      env.VAPID_PRIVATE_KEY
    )

    console.log('通知送信成功')
    return true
  } catch (error) {
    console.error('通知送信エラー:', error)
    return false
  }
}

export default app

