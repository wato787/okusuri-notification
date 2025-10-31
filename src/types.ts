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

