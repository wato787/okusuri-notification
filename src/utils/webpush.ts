import type { PushSubscription, NotificationData } from '../types'
import { buildRequest, type JwtData } from 'cf-webpush'

/**
 * Web Push通知を送信
 */
export async function sendWebPushNotification(
  subscription: PushSubscription,
  notification: NotificationData,
  vapidPrivateKey: string
): Promise<void> {
  const subscriber = 'mailto:example@example.com'

  // 通知データをJSONエンコード
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
  })

  // VAPID秘密鍵をJWK形式としてパース
  let jwk: JsonWebKey
  try {
    jwk = JSON.parse(vapidPrivateKey) as JsonWebKey
  } catch (error) {
    throw new Error(
      'VAPID秘密鍵はJWK形式（JSON文字列）である必要があります。' +
      '例: {"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}'
    )
  }

  // JWTデータを構築
  const now = Math.floor(Date.now() / 1000)
  const jwtData: JwtData = {
    aud: new URL(subscription.endpoint).origin,
    exp: now + 12 * 60 * 60, // 12時間
    sub: subscriber,
  }

  // Web Pushリクエストを構築
  const request = await buildRequest(
    {
      jwk,
      jwt: jwtData,
      payload,
      ttl: 30,
    },
    subscription
  )

  // Web Push通知を送信
  const response = await fetch(request)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Web Push送信失敗: ${response.status} ${response.statusText} - ${errorText}`
    )
  }
}
