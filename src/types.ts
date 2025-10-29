// 型定義

// Web Pushサブスクリプション
export interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

// 通知データ
export interface NotificationData {
  title: string
  body: string
  data?: {
    messageId?: string
    timestamp?: string
    userId?: string
  }
}

// 環境変数
export interface Env {
  // VAPID鍵
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  // Web Pushサブスクリプション（必須）
  PUSH_SUBSCRIPTION?: string // JSON文字列
  // ユーザーID（環境変数から読み込み可能）
  USER_ID?: string
}

