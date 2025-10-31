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
      
      // 410 Gone: サブスクリプションが無効（期限切れまたは購読解除）
      if (webPushError.statusCode === 410) {
        const errorMessage =
          webPushError.body ||
          'プッシュサブスクリプションが期限切れまたは購読解除されています。新しいサブスクリプションが必要です。'
        throw new Error(`サブスクリプション無効 (410): ${errorMessage}`)
      }
      
      // その他のHTTPエラー
      throw new Error(
        `Web Push送信エラー (HTTP ${webPushError.statusCode}): ${
          webPushError.body || '不明なエラー'
        }`
      )
    }
    
    // その他のエラーはそのまま再スロー
    throw error
  }
}

