import type { Context } from 'aws-lambda'
import {
  sendWebPushNotification,
} from './utils/webpush'
import type { PushSubscription } from './types'

// 固定通知メッセージ
const DEFAULT_NOTIFICATION_MESSAGE = 'お薬の時間です'

/**
 * Lambdaハンドラー
 */
export const handler = async (
  _event: unknown,
  _context: Context
): Promise<{ success: boolean; message?: string }> => {
  try {
    const result = await sendNotification()

    if (result) {
      return {
        success: true,
        message: '通知送信成功',
      }
    } else {
      return {
        success: false,
        message: '通知送信に失敗しました',
      }
    }
  } catch (error) {
    console.error('通知送信エラー:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'unknown error',
    }
  }
}

/**
 * 通知送信処理
 */
async function sendNotification(): Promise<boolean> {
  // 環境変数から取得
  const pushSubscription = process.env.PUSH_SUBSCRIPTION
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const userId = process.env.USER_ID || 'user-1'

  // サブスクリプションが設定されていない
  if (!pushSubscription || pushSubscription === '') {
    console.error('PUSH_SUBSCRIPTIONが設定されていません')
    return false
  }

  // サブスクリプションJSONをパース
  let subscription: PushSubscription
  try {
    subscription = JSON.parse(pushSubscription)
  } catch (error) {
    console.error('サブスクリプションJSONパースエラー:', error)
    return false
  }

  // VAPID鍵の確認
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID鍵が設定されていません')
    return false
  }

  // 固定メッセージを使用
  const message = DEFAULT_NOTIFICATION_MESSAGE

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
      vapidPublicKey,
      vapidPrivateKey
    )

    console.log('通知送信成功')
    return true
  } catch (error) {
    console.error('通知送信エラー:', error)
    return false
  }
}

