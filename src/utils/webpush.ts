import type { PushSubscription, NotificationData } from '../types.js'
import webpush from 'web-push'

/**
 * Web Push通知を送信
 * @throws WebPushError 通知送信に失敗した場合（サブスクリプションが無効など）
 */
export async function sendWebPushNotification(
  subscription: PushSubscription,
  notification: NotificationData,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<void> {
  // 通知データをJSONエンコード
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
  })

  // Web Push通知を送信
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      payload,
      {
        TTL: 30, // Time To Live (秒)
        vapidDetails: {
          subject: 'mailto:example@example.com', // Subscriber (開発者のメールアドレス)
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
        },
      }
    )
  } catch (error: unknown) {
    // WebPushErrorの場合、statusCodeを確認
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
    ) {
      const webPushError = error as { statusCode: number; body?: string }
      
      // エラーボディをパースして詳細な情報を取得
      let errorBody: unknown = null
      if (webPushError.body) {
        try {
          errorBody = JSON.parse(webPushError.body)
        } catch {
          // JSONパースに失敗した場合は文字列のまま使用
          errorBody = webPushError.body
        }
      }
      
      // 410 Gone: サブスクリプションが無効（期限切れまたは購読解除）
      if (webPushError.statusCode === 410) {
        const errorMessage =
          typeof errorBody === 'object' && errorBody !== null && 'reason' in errorBody
            ? (errorBody as { reason: string }).reason
            : webPushError.body ||
              'プッシュサブスクリプションが期限切れまたは購読解除されています。新しいサブスクリプションが必要です。'
        throw new Error(`サブスクリプション無効 (410): ${errorMessage}`)
      }
      
      // 400 Bad Request: VAPID鍵の不一致などの問題
      if (webPushError.statusCode === 400) {
        const reason =
          typeof errorBody === 'object' && errorBody !== null && 'reason' in errorBody
            ? (errorBody as { reason: string }).reason
            : '不明なエラー'
        
        if (reason === 'VapidPkHashMismatch') {
          throw new Error(
            `VAPID公開鍵の不一致 (400): サブスクリプション作成時に使用されたVAPID公開鍵と、現在使用しているVAPID公開鍵が異なります。同じVAPID鍵ペアでサブスクリプションを作成し直してください。`
          )
        }
        
        throw new Error(`Web Push送信エラー (HTTP 400): ${reason}`)
      }
      
      // その他のHTTPエラー
      const reason =
        typeof errorBody === 'object' && errorBody !== null && 'reason' in errorBody
          ? (errorBody as { reason: string }).reason
          : webPushError.body || '不明なエラー'
      throw new Error(`Web Push送信エラー (HTTP ${webPushError.statusCode}): ${reason}`)
    }
    
    // その他のエラーはそのまま再スロー
    throw error
  }
}

