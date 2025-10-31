# 通知送信プロセス詳細ドキュメント

## 目次

1. [概要](#概要)
2. [エンドポイント](#エンドポイント)
3. [アーキテクチャ概要](#アーキテクチャ概要)
4. [詳細な処理フロー](#詳細な処理フロー)
5. [データモデル](#データモデル)
6. [通知メッセージ生成ロジック](#通知メッセージ生成ロジック)
7. [Web Push実装詳細](#web-push実装詳細)
8. [重複防止メカニズム](#重複防止メカニズム)
9. [エラーハンドリング](#エラーハンドリング)
10. [依存関係と設定](#依存関係と設定)
11. [Lambda/Cloudflare移行のための考慮事項](#lambdacloudflare移行のための考慮事項)

---

## 概要

本システムは、薬の服用を忘れないようにするためのWeb Push通知を送信する機能を提供しています。通知送信は、`POST /api/notification` エンドポイントを通じて実行され、以下の処理が行われます：

- 全ユーザーの取得
- 各ユーザーの通知設定の取得
- ユーザーの服薬ステータスの計算
- ステータスに応じた通知メッセージの生成
- Web Push通知の送信

通知は、休薬期間の判定や連続服用日数などの情報に基づいて、適切なメッセージが生成されます。

---

## エンドポイント

### POST /api/notification

通知送信を実行するエンドポイント。

**認証**: 不要（将来的に認証が必要になる可能性あり）

**リクエスト**: ボディなし（空リクエスト）

**レスポンス**:
```json
{
  "message": "notification sent successfully",
  "sent_count": 10,
  "process_time_ms": 1234
}
```

**処理内容**:
- 全ユーザーを取得
- 全通知設定を取得
- 各ユーザーに対して通知を送信
- 送信結果を集計して返却

---

## アーキテクチャ概要

通知送信機能は、以下のレイヤーで構成されています：

```
┌─────────────────────────────────────────┐
│  Handler Layer (notification.go)       │
│  - HTTP リクエストの受付                 │
│  - ユーザー・設定データの取得           │
│  - 通知メッセージの生成                 │
│  - レスポンスの返却                     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Service Layer                          │
│  ┌─────────────────────────────────────┐│
│  │ NotificationService                 ││
│  │ - Web Push通知の送信                ││
│  │ - 重複送信防止                      ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ MedicationService                   ││
│  │ - 服薬ステータスの計算              ││
│  │ - 休薬期間の判定                    ││
│  │ - 連続服用日数の計算                ││
│  └─────────────────────────────────────┘│
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Repository Layer                       │
│  ┌─────────────────────────────────────┐│
│  │ NotificationRepository              ││
│  │ - 通知設定の取得・登録              ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ UserRepository                      ││
│  │ - ユーザー情報の取得                ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ MedicationRepository                ││
│  │ - 服薬ログの取得                    ││
│  └─────────────────────────────────────┘│
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Database (PostgreSQL via GORM)         │
└─────────────────────────────────────────┘
```

---

## 詳細な処理フロー

### 1. エンドポイント呼び出し

**ファイル**: `internal/handler/notification.go`  
**メソッド**: `SendNotification`

```
POST /api/notification
    ↓
NotificationHandler.SendNotification()
```

### 2. リクエスト開始ログ出力

**メソッド**: `logRequestStart`

処理開始時刻、リクエストパス、IPアドレス、リクエストIDなどの情報をログに出力します。

**ログ出力例**:
```
========== 通知送信処理開始 [2024-01-01 12:00:00] ==========
リクエストパス: /api/notification
リクエスト元IP: 127.0.0.1
リクエストID: (設定されている場合)
```

### 3. ユーザーと通知設定の取得

**メソッド**: `fetchUsersAndSettings`

**処理内容**:

1. **全ユーザーの取得**
   - `UserRepository.GetAllUsers()` を呼び出し
   - データベースから `user` テーブルの全レコードを取得
   - エラー時はHTTP 500エラーを返却

2. **全通知設定の取得**
   - `NotificationRepository.GetAllSettings()` を呼び出し
   - データベースから `notification_setting` テーブルの全レコードを取得
   - エラー時はHTTP 500エラーを返却

**取得したデータ例**:
```go
users = [
    {ID: "user1", Name: "ユーザー1", Email: "user1@example.com", ...},
    {ID: "user2", Name: "ユーザー2", Email: "user2@example.com", ...},
    ...
]

settings = [
    {UserID: "user1", Platform: "web", IsEnabled: true, Subscription: "{...}"},
    {UserID: "user1", Platform: "web", IsEnabled: false, Subscription: "{...}"},  // 古い設定
    {UserID: "user2", Platform: "web", IsEnabled: true, Subscription: "{...}"},
    ...
]
```

### 4. 通知設定マップの構築

**メソッド**: `buildSettingsMap`

同一ユーザーに対して複数の通知設定が存在する場合、最新の設定（`UpdatedAt`が最も新しいもの）を選択します。

**処理ロジック**:
```go
settingsMap := make(map[string]model.NotificationSetting)
for _, setting := range settings {
    existingSetting, exists := settingsMap[setting.UserID]
    if !exists || setting.UpdatedAt.After(existingSetting.UpdatedAt) {
        settingsMap[setting.UserID] = setting
    }
}
```

**結果例**:
```go
settingsMap = {
    "user1": {UserID: "user1", Platform: "web", IsEnabled: true, Subscription: "{最新の設定}"},
    "user2": {UserID: "user2", Platform: "web", IsEnabled: true, Subscription: "{最新の設定}"},
}
```

### 5. 各ユーザーへの通知送信処理

**メソッド**: `processNotifications`

全ユーザーをループし、各ユーザーに対して通知を送信します。

**処理ロジック**:
```go
sentSubs := make(map[string]bool)  // 送信済みサブスクリプションを記録

for _, user := range users {
    if sendUserNotification(user, settingsMap, sentSubs) {
        // 送信成功時のログ
    }
}
```

**重複防止**:
- 同じ `Subscription` に対しては1回のみ送信（`sentSubs` マップで管理）

### 6. 個別ユーザーへの通知送信

**メソッド**: `sendUserNotification`

**処理ステップ**:

#### 6.1 通知設定の確認

```go
setting, ok := settingsMap[user.ID]
if !ok || !setting.IsEnabled {
    return false  // 通知設定が存在しない、または無効化されている
}
```

#### 6.2 重複送信チェック

```go
if _, alreadySent := sentSubs[setting.Subscription]; alreadySent && setting.Subscription != "" {
    return false  // 同じサブスクリプションに既に送信済み
}
```

#### 6.3 通知メッセージの取得

**デフォルトメッセージ**:
```go
message := "お薬の時間です。忘れずに服用してください。"
```

**ステータスベースのメッセージ生成**:
1. `MedicationService.GetMedicationStatus(userID)` を呼び出し
2. 服薬ステータスが取得できた場合、`generateStatusBasedMessage()` でメッセージを生成

#### 6.4 連続服用日数の取得

```go
consecutiveDays := 0
if statusErr == nil {
    consecutiveDays = medicationStatus.CurrentStreak
}
```

#### 6.5 通知送信

```go
err := h.notificationSvc.SendNotificationWithDays(user, setting, message, consecutiveDays)
```

#### 6.6 送信済みマーク

```go
if setting.Subscription != "" {
    sentSubs[setting.Subscription] = true
}
```

### 7. 通知メッセージ生成ロジック

**メソッド**: `generateStatusBasedMessage`

**入力**: `MedicationStatusResponse`

```go
type MedicationStatusResponse struct {
    CurrentStreak           int  // 現在の連続服用日数
    IsRestPeriod            bool // 休薬期間中かどうか
    RestDaysLeft            int  // 休薬期間の残り日数
    ConsecutiveBleedingDays int  // 連続出血日数
}
```

**メッセージ生成ロジック**:

1. **休薬期間中の場合** (`IsRestPeriod == true`):
   - `RestDaysLeft > 0`: 
     ```
     "現在休薬期間中です。あと{N}日で服薬を再開してください。"
     ```
   - `RestDaysLeft == 0`:
     ```
     "休薬期間が終了しました。本日から服薬を再開してください。"
     ```

2. **通常の服薬期間中の場合** (`IsRestPeriod == false`):
   - `CurrentStreak > 0`:
     ```
     "お薬の時間です。忘れずに服用してください。（連続{N}日目）"
     ```
   - `CurrentStreak == 0`:
     ```
     "お薬の時間です。忘れずに服用してください。"
     ```

### 8. 服薬ステータス計算の詳細

**ファイル**: `internal/service/medication.go`  
**メソッド**: `GetMedicationStatus`

**処理フロー**:

1. **服薬ログの取得**
   ```go
   logs, err := s.medicationRepo.GetLogsByUserID(userID)
   ```

2. **ログのソート**
   - 作成日時で降順（新しい順）にソート

3. **休薬期間の判定**
   - `calculateRestPeriodStatus()` を呼び出し
   - 連続3日以上の出血がある場合、4日間の休薬期間に入る
   - 休薬期間は出血開始日から4日間

4. **連続服用日数の計算**
   - 休薬期間中でない場合のみ計算
   - `calculateCurrentStreak()` を呼び出し
   - 最後の休薬期間終了日以降の連続服用日数をカウント

**休薬期間判定の詳細**:

- 連続出血日数が3日以上の場合、休薬期間に入る
- 休薬期間は4日間
- 休薬開始日は連続出血の最初の日
- 休薬終了日は休薬開始日から4日後の23:59:59

**連続服用日数の計算**:

- 最後の休薬期間終了日以降の服薬ログを確認
- 今日または昨日に服薬がある場合、カウントに含める
- 連続している日をカウント（日付が1日ずつ連続している必要がある）

### 9. Web Push通知送信の詳細

**ファイル**: `internal/service/notification.go`  
**メソッド**: `SendNotificationWithDays`

**処理フロー**:

#### 9.1 サブスクリプションのバリデーション

```go
if setting.Subscription == "" {
    return fmt.Errorf("サブスクリプションが見つかりません")
}
```

#### 9.2 サブスクリプションJSONのパース

```go
var subscription PushSubscription
err := json.Unmarshal([]byte(setting.Subscription), &subscription)
```

**サブスクリプションJSON構造**:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BASE64_ENCODED_KEY",
    "auth": "BASE64_ENCODED_KEY"
  }
}
```

#### 9.3 重複送信チェック（サービスレベル）

**メソッド**: `isRecentlySent`

- 同じ `endpoint` に対して5分以内に送信した場合、スキップ
- インメモリで `recentSends` マップに記録
- スレッドセーフな実装（`sync.Mutex` を使用）

```go
subKey := subscription.Endpoint
if s.isRecentlySent(subKey) {
    return nil  // エラーにせず成功扱いでスキップ
}
```

#### 9.4 VAPID鍵の取得

```go
vapidPublicKey := os.Getenv("VAPID_PUBLIC_KEY")
vapidPrivateKey := os.Getenv("VAPID_PRIVATE_KEY")
```

環境変数から取得。設定されていない場合はエラーを返却。

#### 9.5 通知データの作成

```go
notificationData := NotificationData{
    Title: "お薬通知",
    Body:  message,
    Data: map[string]string{
        "messageId":       fmt.Sprintf("medication-%d", time.Now().UnixNano()),
        "timestamp":       fmt.Sprintf("%d", time.Now().Unix()),
        "userId":          user.ID,
        "consecutiveDays": fmt.Sprintf("%d", consecutiveDays),
    },
}
```

#### 9.6 Web Push通知の送信

**ライブラリ**: `github.com/SherClockHolmes/webpush-go`

```go
_, err = webpush.SendNotification(
    payload,  // JSONエンコードされた通知データ
    &webpush.Subscription{
        Endpoint: subscription.Endpoint,
        Keys: webpush.Keys{
            P256dh: subscription.Keys.P256dh,
            Auth:   subscription.Keys.Auth,
        },
    },
    &webpush.Options{
        VAPIDPublicKey:  vapidPublicKey,
        VAPIDPrivateKey: vapidPrivateKey,
        TTL:             30,  // Time To Live (秒)
        Subscriber:      "example@example.com",  // 開発者のメールアドレス
    },
)
```

#### 9.7 送信記録の更新

**メソッド**: `markAsSent`

- 送信成功時に `recentSends` マップに記録
- 1時間以上前の記録を自動削除（メモリリーク防止）

### 10. 処理完了とレスポンス返却

**メソッド**: `logAndRespond`

処理時間を計算し、結果をログ出力してHTTPレスポンスを返却します。

**レスポンス例**:
```json
{
  "message": "notification sent successfully",
  "sent_count": 10,
  "process_time_ms": 1234
}
```

**ログ出力例**:
```
処理時間: 1.234s
========== 通知送信処理終了 [2024-01-01 12:00:01] ==========
```

---

## データモデル

### NotificationSetting

**ファイル**: `internal/model/notification.go`

```go
type NotificationSetting struct {
    ID           uint           `json:"id"`
    CreatedAt    time.Time      `json:"createdAt"`
    UpdatedAt    time.Time      `json:"updatedAt"`
    DeletedAt    gorm.DeletedAt `json:"deletedAt,omitempty"`
    UserID       string         `json:"userId" gorm:"not null;index:idx_user_platform,unique:true,part:1"`
    Platform     string         `json:"platform" gorm:"not null;index:idx_user_platform,unique:true,part:2"`
    IsEnabled    bool           `json:"isEnabled" gorm:"default:true"`
    Subscription string         `json:"subscription" gorm:"type:text"`
}
```

**テーブル名**: `notification_setting`

**制約**:
- `(UserID, Platform)` の組み合わせでユニーク
- `Subscription` はテキスト型でWeb PushサブスクリプションJSONを保存

### User

**ファイル**: `internal/model/user.go`

```go
type User struct {
    ID            string    `json:"id"`
    Name          string    `json:"name"`
    Email         string    `json:"email" gorm:"unique"`
    EmailVerified bool      `json:"emailVerified"`
    Image         *string   `json:"image"`
    CreatedAt     time.Time `json:"createdAt"`
    UpdatedAt     time.Time `json:"updatedAt"`
}
```

**テーブル名**: `user`

### MedicationLog

服薬ログ。通知メッセージ生成時に参照されます。

**主なフィールド**:
- `UserID`: ユーザーID
- `CreatedAt`: 服薬日時
- `HasBleeding`: 出血有無

---

## 通知メッセージ生成ロジック

### メッセージ生成の決定フローチャート

```
開始
  ↓
通知設定が有効か？
  ├─ NO → スキップ
  ↓ YES
サブスクリプションが存在するか？
  ├─ NO → スキップ
  ↓ YES
既に同じサブスクリプションに送信済みか？
  ├─ YES → スキップ
  ↓ NO
服薬ステータスを取得
  ├─ エラー → デフォルトメッセージを使用
  ↓ 成功
休薬期間中か？
  ├─ YES → 休薬期間メッセージを生成
  │         (残り日数に応じてメッセージを変更)
  ↓ NO
連続服用日数は？
  ├─ > 0 → "お薬の時間です。忘れずに服用してください。（連続{N}日目）"
  ↓ == 0
"お薬の時間です。忘れずに服用してください。"
  ↓
Web Push通知を送信
  ↓
送信済みとしてマーク
  ↓
終了
```

### メッセージ種類一覧

| 状況 | メッセージ |
|------|-----------|
| デフォルト（ステータス取得失敗時） | お薬の時間です。忘れずに服用してください。 |
| 休薬期間中（残り日数 > 0） | 現在休薬期間中です。あと{N}日で服薬を再開してください。 |
| 休薬期間終了（残り日数 == 0） | 休薬期間が終了しました。本日から服薬を再開してください。 |
| 通常期間（連続日数 > 0） | お薬の時間です。忘れずに服用してください。（連続{N}日目） |
| 通常期間（連続日数 == 0） | お薬の時間です。忘れずに服用してください。 |

---

## Web Push実装詳細

### Web Pushプロトコル

本システムは、Web Push Protocol標準に基づいた実装を使用しています。

### 必要な鍵情報

1. **VAPID鍵**:
   - `VAPID_PUBLIC_KEY`: 公開鍵（環境変数）
   - `VAPID_PRIVATE_KEY`: 秘密鍵（環境変数）

2. **サブスクリプション情報** (ユーザーごとに保存):
   - `endpoint`: Web PushサービスのエンドポイントURL
   - `keys.p256dh`: クライアント公開鍵
   - `keys.auth`: 認証シークレット

### 通知ペイロード構造

```json
{
  "title": "お薬通知",
  "body": "お薬の時間です。忘れずに服用してください。（連続5日目）",
  "data": {
    "messageId": "medication-1234567890",
    "timestamp": "1234567890",
    "userId": "user123",
    "consecutiveDays": "5"
  }
}
```

### Web Push送信ライブラリ

**パッケージ**: `github.com/SherClockHolmes/webpush-go`

**使用メソッド**: `webpush.SendNotification()`

**パラメータ**:
- `payload`: 通知データのJSONバイト配列
- `subscription`: サブスクリプション情報
- `options`: VAPID鍵、TTL、Subscriber情報

### TTL (Time To Live)

通知の有効期限を30秒に設定しています。30秒以内に通知がデバイスに届かなかった場合、通知は失効します。

```go
TTL: 30
```

### Subscriber

VAPID設定に必要な開発者のメールアドレス。現在は `"example@example.com"` がハードコードされています。

---

## 重複防止メカニズム

本システムは、複数のレベルで重複送信を防止しています。

### 1. ハンドラーレベル

**メソッド**: `processNotifications`, `sendUserNotification`

**実装**:
```go
sentSubs := make(map[string]bool)

for _, user := range users {
    if _, alreadySent := sentSubs[setting.Subscription]; alreadySent {
        continue  // スキップ
    }
    // 通知送信
    sentSubs[setting.Subscription] = true
}
```

**スコープ**: 1回のAPI呼び出し内

**効果**: 同じリクエスト内で同じサブスクリプションに複数回送信することを防止

### 2. サービスレベル

**メソッド**: `isRecentlySent`, `markAsSent`

**実装**:
```go
recentSends map[string]time.Time  // endpoint -> 送信時刻

// 5分以内に送信済みかチェック
if time.Since(lastSent) < 5*time.Minute {
    return true  // 重複
}
```

**スコープ**: プロセス内（インメモリ）

**効果**: 短時間内の繰り返し送信を防止（5分間のクールダウン）

**注意**: プロセス再起動時にリセットされる。Lambdaなどのステートレス環境では、別のメカニズムが必要になる可能性があります。

### 3. 通知設定マップ構築時の重複除去

**メソッド**: `buildSettingsMap`

同一ユーザーに複数の通知設定がある場合、最新の設定のみを使用します。

```go
if !exists || setting.UpdatedAt.After(existingSetting.UpdatedAt) {
    settingsMap[setting.UserID] = setting
}
```

**効果**: 同一ユーザーに対する最新の通知設定のみを使用

---

## エラーハンドリング

### エラーケースと対応

| エラーケース | 処理 | HTTPステータス |
|-------------|------|----------------|
| ユーザー取得失敗 | エラーログ出力、500エラー返却 | 500 |
| 通知設定取得失敗 | エラーログ出力、500エラー返却 | 500 |
| サブスクリプションが空 | ログ出力、スキップ（エラーにしない） | - |
| サブスクリプションJSONパース失敗 | エラーログ出力、スキップ | - |
| 重複送信（5分以内） | ログ出力、スキップ（成功扱い） | - |
| VAPID鍵未設定 | エラーログ出力、エラー返却 | - |
| Web Push送信失敗 | エラーログ出力、スキップ | - |
| 服薬ステータス取得失敗 | デフォルトメッセージを使用 | - |

### ログ出力

各処理段階で詳細なログが出力されます。

**ログ例**:
```
========== 通知送信処理開始 [2024-01-01 12:00:00] ==========
取得したユーザー数: 10
取得した通知設定数: 12
通知対象ユーザー数: 8
----- 通知送信処理開始 -----
>> 通知サービス: ユーザーID: user1 の処理を開始します
>> サブスクリプション: https://fcm.goo...
>> 通知サービス: 通知送信成功
ユーザーID: user1 への通知送信成功
...
----- 通知送信処理完了: 合計8件送信 -----
処理時間: 1.234s
========== 通知送信処理終了 [2024-01-01 12:00:01] ==========
```

### 部分的な失敗の扱い

- 一部のユーザーへの通知送信が失敗しても、他のユーザーへの送信は継続します
- 最終的な `sent_count` は成功した送信数のみをカウントします
- 個々の送信失敗はエラーログに記録されますが、全体の処理は成功として扱われます

---

## 依存関係と設定

### データベース

- **DBMS**: PostgreSQL
- **ORM**: GORM (gorm.io/gorm)
- **接続**: `pkg/config/database.go` で管理
- **環境変数**: `DATABASE_URL`

### 外部ライブラリ

- **Web Push**: `github.com/SherClockHolmes/webpush-go`
- **Web Framework**: `github.com/gin-gonic/gin`
- **DB**: `gorm.io/gorm`

### 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL接続URL | はい |
| `VAPID_PUBLIC_KEY` | Web Push VAPID公開鍵 | はい |
| `VAPID_PRIVATE_KEY` | Web Push VAPID秘密鍵 | はい |

### 初期化処理

**ファイル**: `cmd/server/main.go`

```go
// 1. DB接続
config.SetupDB()

// 2. マイグレーション実行
migrations.RunMigrations(config.GetDB())

// 3. ルーター設定（依存関係注入）
router := routes.SetupRoutes()

// 4. サーバー起動
router.Run(":8080")
```

### 依存関係注入

**ファイル**: `internal/routes.go`

各レイヤーが適切に初期化され、依存関係が注入されます。

```go
// Repository
notificationRepo := repository.NewNotificationRepository()
userRepo := repository.NewUserRepository()

// Service
notificationService := service.NewNotificationService()
medicationService := service.NewMedicationService(medicationRepo)

// Handler
notificationHandler := handler.NewNotificationHandler(
    notificationRepo,
    userRepo,
    notificationService,
    medicationRepo,
    medicationService,
)
```

---

## Lambda/Cloudflare移行のための考慮事項

### 1. ステートレスな環境への対応

**現状の問題**:
- `NotificationService` が `recentSends` マップをインメモリで保持
- LambdaやCloudflare Workersはステートレスなため、リクエスト間で状態を保持できない

**対応案**:
- 外部ストレージ（Redis、DynamoDB、Cloudflare KV等）で送信記録を管理
- または、データベースに送信記録テーブルを追加
- 5分以内の重複チェックロジックを外部ストレージ経由で実装

### 2. データベース接続の管理

**現状**:
- サーバー起動時に1回のみDB接続を確立
- 接続プールを維持

**Lambda/Cloudflare対応**:
- コールドスタート時の接続確立時間を考慮
- 接続プールのサイズを調整
- 可能であれば接続を再利用（Lambda Container reuse）
- Cloudflare Workersの場合、TCP接続の制限に注意

### 3. タイムアウト設定

**現状**:
- 制限なし（全ユーザーを順次処理）

**Lambda/Cloudflare対応**:
- Lambda: 最大実行時間15分
- Cloudflare Workers: 最大実行時間30秒（無料プラン）またはCPU時間制限
- 大量のユーザーがいる場合、バッチ処理やキューイングが必要
- 並列処理を検討（goroutineやWorker subrequests）

### 4. 環境変数の設定

**現状**:
- `.env` ファイルまたは環境変数で管理

**Lambda/Cloudflare対応**:
- Lambda: 環境変数として設定
- Cloudflare Workers: Workers環境変数として設定
- シークレット管理（AWS Secrets Manager、Cloudflare Secrets等）を検討

### 5. エラーハンドリングとリトライ

**現状**:
- エラー時はログ出力のみ、リトライなし

**Lambda/Cloudflare対応**:
- 失敗した通知を再試行する仕組みを検討（Dead Letter Queue、再スケジュール等）
- 部分的失敗の詳細な記録（どのユーザーに失敗したか）
- 監視とアラートの設定

### 6. 定期実行の実装

**現状**:
- 手動でAPIを呼び出す必要がある

**Lambda/Cloudflare対応**:
- **Lambda**: EventBridge（旧CloudWatch Events）でスケジュール実行
- **Cloudflare Workers**: Cron Triggersで定期実行
- 実行頻度の設定（例: 毎日指定時刻に1回）

### 7. コスト最適化

**Lambda**:
- 実行時間を最小化（不要な処理を削減）
- メモリ設定の最適化
- Provisioned Concurrencyは通常不要（スケジュール実行のため）

**Cloudflare Workers**:
- CPU時間の節約
- 外部API呼び出しの最小化

### 8. 監視とロギング

**現状**:
- 標準出力にログ出力

**Lambda/Cloudflare対応**:
- **Lambda**: CloudWatch Logs
- **Cloudflare Workers**: Workers Logs、Analytics
- メトリクスの収集（送信成功数、失敗数、実行時間等）

### 9. セキュリティ

**現状**:
- 認証なしでAPIを呼び出せる

**Lambda/Cloudflare対応**:
- API呼び出しに認証を追加（API Key、Secret等）
- Lambda Function URLの認証設定
- Cloudflare Workersの認証（mTLS、API Token等）

### 10. データベース接続の最適化

**現状**:
- 全ユーザー・全設定を一度に取得

**Lambda/Cloudflare対応**:
- バッチ処理（ページネーション）
- 必要なユーザーのみフィルタリング（通知設定が有効なユーザーのみ取得）
- データベースクエリの最適化（インデックス確認）

### 11. コード構造の変更案

Lambda/Cloudflare移行時は、以下のような構造が考えられます：

```
notification-service/
├── handler/
│   ├── lambda.go          # Lambda Handler
│   └── cloudflare.go      # Cloudflare Worker Handler
├── service/
│   ├── notification.go    # 既存コード（ほぼそのまま使用可）
│   └── storage.go         # 送信記録の外部ストレージ管理
└── main.go                # エントリーポイント
```

### 12. テスト

**現状**:
- `test_notification.sh` で手動テスト

**Lambda/Cloudflare対応**:
- ローカルでのLambda実行テスト（SAM、Serverless Framework等）
- Cloudflare Workersのローカル開発環境（Wrangler）
- 統合テストの追加

---

## 関連ファイル一覧

### ハンドラー
- `internal/handler/notification.go` - 通知送信ハンドラー

### サービス
- `internal/service/notification.go` - Web Push通知送信サービス
- `internal/service/medication.go` - 服薬ステータス計算サービス

### リポジトリ
- `internal/repository/notification.go` - 通知設定リポジトリ
- `internal/repository/user.go` - ユーザーリポジトリ
- `internal/repository/medication.go` - 服薬ログリポジトリ

### モデル
- `internal/model/notification.go` - 通知設定モデル
- `internal/model/user.go` - ユーザーモデル
- `internal/model/medication.go` - 服薬ログモデル

### DTO
- `internal/dto/notification.go` - 通知DTO
- `internal/dto/medication_status.go` - 服薬ステータスDTO

### ルーティング
- `internal/routes.go` - ルート設定と依存関係注入

### エントリーポイント
- `cmd/server/main.go` - アプリケーション起動

### テスト
- `test_notification.sh` - 通知送信テストスクリプト

---

## まとめ

本通知送信機能は、以下の処理を順次実行します：

1. **全ユーザーの取得** - データベースから全ユーザーを取得
2. **通知設定の取得** - 全通知設定を取得し、ユーザーごとの最新設定を選択
3. **各ユーザーへの通知送信**:
   - 通知設定が有効かチェック
   - 重複送信チェック
   - 服薬ステータスの取得とメッセージ生成
   - Web Push通知の送信
4. **結果の返却** - 送信成功数と処理時間を返却

重複防止はハンドラーレベルとサービスレベルで実装されており、ステートレスな環境（Lambda/Cloudflare）に移行する場合は、サービスレベルの重複チェックを外部ストレージで実装する必要があります。

Lambda/Cloudflare移行時は、特に以下の点に注意が必要です：
- ステート管理の外部化
- タイムアウト設定とバッチ処理
- データベース接続管理
- 定期実行の設定
- エラーハンドリングと監視