import type { Context } from 'aws-lambda'
import {
  sendWebPushNotification,
} from './utils/webpush.js'
import type { PushSubscription } from './types.js'

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
    // デバッグ: 受信した文字列の長さと最初/最後の部分をログ出力
    console.log(`PUSH_SUBSCRIPTION文字列長: ${pushSubscription.length}`)
    if (pushSubscription.length > 100) {
      console.log(`PUSH_SUBSCRIPTION先頭100文字: ${pushSubscription.substring(0, 100)}...`)
      console.log(`PUSH_SUBSCRIPTION末尾50文字: ...${pushSubscription.substring(pushSubscription.length - 50)}`)
    } else {
      console.log(`PUSH_SUBSCRIPTION全体: ${pushSubscription}`)
    }

    subscription = JSON.parse(pushSubscription)

    // 必須フィールドの検証
    if (!subscription.endpoint) {
      console.error('サブスクリプションにendpointがありません')
      return false
    }
    if (!subscription.keys || !subscription.keys.p256dh) {
      console.error('サブスクリプションにkeys.p256dhがありません')
      return false
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'unknown error'
    console.error('サブスクリプションJSONパースエラー:', errorMessage)
    console.error('受信した文字列が不完全な可能性があります。SSM Parameter Storeの値を確認してください。')
    if (error instanceof SyntaxError) {
      console.error(`JSON構文エラー位置: ${error.message.includes('position') ? error.message : '不明'}`)
    }
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
    const errorMessage = error instanceof Error ? error.message : 'unknown error'
    console.error('通知送信エラー:', errorMessage)
    
    // サブスクリプションが無効な場合のログ
    if (errorMessage.includes('サブスクリプション無効') || errorMessage.includes('410')) {
      console.error(
        '⚠️ プッシュサブスクリプションが無効です。新しいサブスクリプションを取得してSSM Parameter Storeを更新してください。'
      )
    }
    
    // VAPID公開鍵の不一致の場合のログ
    if (errorMessage.includes('VAPID公開鍵の不一致') || errorMessage.includes('VapidPkHashMismatch')) {
      console.error(
        '⚠️ VAPID公開鍵が一致しません。サブスクリプションを作成した際に使用したVAPID公開鍵と同じものを使用してください。'
      )
      console.error(
        '対処方法: ブラウザで新しいサブスクリプションを作成する際、現在のVAPID公開鍵を使用してください。'
      )
    }
    
    return false
  }
}

