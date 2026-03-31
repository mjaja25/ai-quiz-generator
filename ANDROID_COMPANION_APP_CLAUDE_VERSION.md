# DC Payment Monitor — Android Companion App

> **Standalone Android Studio project.** Runs on the teacher's phone to auto-detect incoming UPI payments and confirm student registrations in real-time.

---

## Quick Summary

**What it does:** Listens for incoming payment notifications from UPI apps (GPay, PhonePe, Paytm) on the teacher's phone, parses the amount, and POSTs it to the website's webhook. The website matches the unique amount to a pending registration and confirms it instantly.

**Two detection channels:**
1. **PRIMARY — UPI App Notifications** via `NotificationListenerService`. Catches ALL amounts including <₹100.
2. **SECONDARY — Bank SMS** via `BroadcastReceiver`. Fallback for ≥₹100 transactions.

**Deduplication** ensures if both channels fire for the same payment, only one webhook call is made.

**BatteryHelper** handles Xiaomi/Oppo/Vivo OEM restrictions that kill background services.

---

## Project Structure (Exact)

```
dc-payment-monitor/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/dreamcentre/companion/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── MonitorService.kt          (ForegroundService for SMS)
│   │   │   │   ├── SmsReceiver.kt
│   │   │   │   ├── SmsParser.kt
│   │   │   │   ├── NotificationMonitor.kt     (NotificationListenerService)
│   │   │   │   ├── NotificationParser.kt
│   │   │   │   ├── PaymentDeduplicator.kt
│   │   │   │   ├── WebhookClient.kt
│   │   │   │   ├── BatteryHelper.kt
│   │   │   │   ├── SettingsManager.kt
│   │   │   │   └── ParsedPayment.kt           (data class)
│   │   │   ├── res/
│   │   │   │   ├── layout/activity_main.xml
│   │   │   │   ├── drawable/ic_notification.xml
│   │   │   │   └── values/
│   │   │   │       ├── strings.xml
│   │   │   │       ├── colors.xml
│   │   │   │       └── themes.xml
│   │   │   └── AndroidManifest.xml
│   │   └── test/
│   │       └── java/com/dreamcentre/companion/
│   │           ├── SmsParserTest.kt
│   │           └── NotificationParserTest.kt
│   └── build.gradle.kts
├── build.gradle.kts                           (project-level)
├── settings.gradle.kts
├── gradle.properties
└── gradle/
    └── wrapper/
        └── gradle-wrapper.properties
```

**Total: ~11 Kotlin files, ~650 lines Kotlin + ~200 lines XML**

---

## Implementation Order (Step-by-Step for Agent)

> [!IMPORTANT]
> Each step below is a self-contained unit. Complete them in order. Each step lists the EXACT files to create and their COMPLETE contents.

### Step 1: Project Scaffolding

Create the Gradle build files. These define the project, SDK versions, and dependencies.

**Files to create:**
- `settings.gradle.kts`
- `build.gradle.kts` (project-level)
- `app/build.gradle.kts` (app-level)
- `gradle.properties`
- `gradle/wrapper/gradle-wrapper.properties`

**Key config:**
- `compileSdk = 34`, `minSdk = 26`, `targetSdk = 34`
- `applicationId = "com.dreamcentre.companion"`
- `versionCode = 1`, `versionName = "2.0"`
- Dependencies: `okhttp:4.12.0`, `appcompat`, `material`, `core-ktx`
- Kotlin JVM target: 17

---

### Step 2: Data Model

Create `ParsedPayment.kt` — the shared data class used by both SMS and notification parsers.

```kotlin
package com.dreamcentre.companion

data class ParsedPayment(
    val amount: String,
    val reference: String?,
    val sender: String?,
    val source: String,           // "GPay", "PhonePe", "Paytm", "BHIM", "HDFC", "SBI", etc.
    val detectionMethod: String,  // "notification" or "sms"
    val timestamp: Long = System.currentTimeMillis()
)
```

---

### Step 3: SettingsManager

SharedPreferences wrapper. Stores webhook URL, shared secret, and monitoring state.

```kotlin
package com.dreamcentre.companion

import android.content.Context

class SettingsManager(context: Context) {
    private val prefs = context.getSharedPreferences("dc_companion", Context.MODE_PRIVATE)

    fun getWebhookUrl(): String = prefs.getString("webhook_url", "") ?: ""
    fun setWebhookUrl(url: String) = prefs.edit().putString("webhook_url", url).apply()

    fun getSecret(): String = prefs.getString("secret", "") ?: ""
    fun setSecret(secret: String) = prefs.edit().putString("secret", secret).apply()

    fun isMonitoring(): Boolean = prefs.getBoolean("is_monitoring", false)
    fun setMonitoring(active: Boolean) = prefs.edit().putBoolean("is_monitoring", active).apply()
}
```

---

### Step 4: PaymentDeduplicator

Singleton that prevents double webhook calls when both SMS and notification fire for the same payment.

**Logic:**
- If reference (UTR) is available → dedup key = `ref:{UTR}`
- If no reference → dedup key = `amt:{amount}:{2-min-bucket}`
- Window = 5 minutes. After that, entries are cleaned up.

---

### Step 5: WebhookClient

OkHttp-based POST client with HMAC-SHA256 authentication and 3x retry.

**Webhook payload:**
```json
{
  "amount": "507.32",
  "reference": "430686551035",
  "sender": "Rahul Sharma",
  "source": "GPay",
  "detectionMethod": "notification",
  "timestamp": 1710249000000
}
```

**Headers:** `X-Webhook-Secret`, `X-Webhook-Signature` (HMAC of body), `Content-Type: application/json`

**Must run on a background thread** (use `Thread { ... }.start()` or coroutines).

---

### Step 6: SmsParser

Parses bank credit SMS messages. This is the SECONDARY/FALLBACK channel.

**Key functions:**
- `isBankCreditSms(sender, body)` — checks sender ID against known bank sender codes (HDFCBK, SBIINB, ICICIB, AXISBK, KOTAKB, PNBSMS, etc.) and checks for "credited"/"received" keywords
- `extractAmount(body)` — regex for `Rs.507.32 credited` patterns
- `extractUpiRef(body)` — regex for 12-digit UPI ref numbers
- `extractSenderName(body)` — regex for `from Rahul Sharma` patterns
- `parse(smsSender, body)` → `ParsedPayment?`

**Bank sender map:** HDFCBK→HDFC, SBIINB→SBI, ICICIB→ICICI, AXISBK→Axis, KOTAKB→Kotak, PNBSMS→PNB, BOIIND→BOI, CANBNK→Canara, UBOIB→Union

---

### Step 7: NotificationParser

Parses UPI app push notifications. This is the PRIMARY channel.

**UPI app package names:**
```kotlin
val upiApps = mapOf(
    "com.google.android.apps.nbu.paisa.user" to "GPay",
    "com.phonepe.app" to "PhonePe",
    "net.one97.paytm" to "Paytm",
    "in.org.npci.upiapp" to "BHIM",
    "com.dreamplug.androidapp" to "Cred"
)
```

**Key behavior:**
- UPI apps use `₹` symbol in notifications (simpler than bank SMS)
- GPay: title="You received ₹500", text="From Rahul Sharma"
- PhonePe: title="Payment Received", text="₹500 received from Rahul"
- Paytm: title="Money Received", text="₹500 received from Rahul@paytm"
- Extract amount via `₹\s*([\d,]+(?:\.\d{2})?)` regex
- Extract sender via `from\s+(.+?)(?:\s*$|\s*\(|\.$)` regex
- Skip notifications containing: OTP, debited, withdrawn, offer, cashback

---

### Step 8: SmsReceiver

BroadcastReceiver for `SMS_RECEIVED`. Registered dynamically in MonitorService.

**Flow:** Receive SMS → check if bank credit SMS → parse → dedup check → webhook POST

---

### Step 9: NotificationMonitor

Extends `NotificationListenerService`. System-managed (no ForegroundService needed).

**Flow:** Notification arrives → check if from target UPI app → parse → dedup check → webhook POST

**Uses `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`** from notification extras.

---

### Step 10: MonitorService (ForegroundService)

Keeps `SmsReceiver` alive. Shows persistent notification: "DC Payment Monitor — Listening for payments..."

**Note:** `NotificationListenerService` is managed by the Android system independently. This ForegroundService only exists for the SMS channel.

---

### Step 11: BatteryHelper

Routes teacher to OEM-specific AutoStart/Battery settings.

**OEM intents:**
- Xiaomi: `com.miui.securitycenter` → `AutoStartManagementActivity`
- Oppo: `com.coloros.safecenter` → `StartupAppListActivity`
- Vivo: `com.vivo.permissionmanager` → `BgStartUpManagerActivity`
- Huawei: `com.huawei.systemmanager` → `StartupNormalAppListActivity`
- Samsung: `com.samsung.android.lool` → `BatteryActivity`

**Logic:** Try standard Android intent first → try OEM intent → show Toast fallback.

---

### Step 12: MainActivity

Configuration screen with:
- Webhook URL input field
- Shared secret input field (password)
- "Start Monitoring" / "Stop Monitoring" toggle button
- "Test Connection" button
- Notification access status + "Grant Access" button
- SMS permission status
- Last detected payment info
- OEM battery warning banner (if Xiaomi/Oppo/Vivo detected)

**On launch:** Check notification access via `Settings.Secure.getString(contentResolver, "enabled_notification_listeners")`. If not granted, show prominent warning.

---

### Step 13: AndroidManifest.xml

**Permissions:**
```xml
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Components:**
- `MainActivity` (launcher)
- `MonitorService` (foreground, specialUse)
- `NotificationMonitor` (notification listener service with `BIND_NOTIFICATION_LISTENER_SERVICE`)

---

### Step 14: Layout & Resources

- `activity_main.xml` — Material Design 3 layout with TextInputLayouts, MaterialButtons, CardViews for status
- `ic_notification.xml` — Simple vector drawable (payment/money icon)
- `strings.xml`, `colors.xml`, `themes.xml`

---

### Step 15: Unit Tests

- `SmsParserTest.kt` — Test HDFC, SBI, ICICI SMS formats; test OTP/promo filtering
- `NotificationParserTest.kt` — Test GPay, PhonePe, Paytm notification formats; test debit filtering

---

## Build & Install

1. Open `dc-payment-monitor/` in Android Studio
2. Sync Gradle
3. Build APK: Build → Build APK(s)
4. Transfer to teacher's phone, install
5. Open app → grant SMS permission → grant Notification Access
6. Enter webhook URL + secret → tap "Start Monitoring"
7. If Xiaomi/Oppo/Vivo: tap battery warning to whitelist app

---

## Testing

### Simulate SMS (ADB):
```bash
adb shell service call isms 7 i32 0 s16 "com.android.mms.service" s16 "HDFCBK" s16 "null" s16 "Rs.507.32 credited to a/c XX1234 on 12-Mar-26 from Rahul Sharma UPI Ref 430686551035" i64 0 i64 0
```

### Test webhook directly:
```bash
curl -X POST https://your-site.netlify.app/api/payment-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-here" \
  -d '{"amount":"507.32","reference":"430686551035","sender":"Rahul Sharma","source":"GPay","detectionMethod":"notification","timestamp":1710249000000}'
```

---

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| No iOS version | Teacher with iPhone can't auto-detect | Manual admin confirmation fallback |
| Some QR payments may not trigger GPay notification | Missed payment | SMS fallback + manual "I have paid" button |
| Xiaomi/Oppo/Vivo kill background services | App stops | BatteryHelper + foreground service + exemption guide |
| UPI app notification format changes | Parser breaks | Update regex patterns; manual fallback |
| Third-party pays on behalf of student | Sender name mismatch | Amount-only matching (sender stored for audit, never used for matching) |

---

## Design Decisions

1. **UPI app notifications over bank app notifications** — Bank apps (YONO, HDFC Mobile) do NOT reliably send push notifications for transactions. UPI apps (GPay, PhonePe) ALWAYS do.
2. **Amount-only matching** — Sender name is never used as a matching criterion. Supports parents/friends paying on behalf of students.
3. **Dedup by UTR first, amount-bucket second** — Prevents double webhook calls when both SMS and notification fire.
4. **OkHttp over HttpURLConnection** — More reliable, built-in retry, cleaner API.
5. **ForegroundService only for SMS** — NotificationListenerService is system-managed and doesn't need our service.
