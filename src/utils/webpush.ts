import type { PushSubscription, NotificationData } from '../types.js'
import * as webpush from 'web-push'

/**
 * Web Push通知を送信
 */
export async function sendWebPushNotification(
  subscription: PushSubscription,
  notification: NotificationData,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<void> {
  // VAPID鍵を設定
  webpush.setVapidDetails(
    'mailto:example@example.com', // Subscriber (開発者のメールアドレス)
    vapidPublicKey,
    vapidPrivateKey
  )

  // 通知データをJSONエンコード
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
  })

  // Web Push通知を送信
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
    }
  )
}

