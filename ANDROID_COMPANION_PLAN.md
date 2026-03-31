# Android Companion App — Implementation Plan

> **Standalone project.** This is a separate Android Studio project, not part of the website repo. The app runs on the teacher's phone to auto-detect UPI payment SMS and push confirmations to the website's webhook in real-time.

**See also:** `REGISTRATION_IMPLEMENTATION.md` for the website-side registration system that this app feeds into.

---

## Purpose

When a student pays via Google Pay, the teacher receives a payment notification. This app catches it via **two channels**:

1. **UPI app notifications** (primary) — NotificationListenerService reads GPay/PhonePe/Paytm notifications. Works for ALL amounts including < ₹100.
2. **Bank SMS** (secondary) — BroadcastReceiver intercepts bank SMS. Some banks skip < ₹100.

The app parses the payment details and POSTs to the website webhook. The website matches the amount to a pending registration and confirms it.

**Result:** Payment confirmed in ~5-10 seconds. No manual work in most cases.

---

## Architecture

```
Channel 1: UPI App Notifications (PRIMARY)
  GPay/PhonePe/Paytm notification
      └──> NotificationListenerService
              └──> NotificationParser ──┐
                                        ├──> WebhookClient ──> Netlify Webhook
Channel 2: Bank SMS (SECONDARY)         │
  Bank SMS                              │
      └──> BroadcastReceiver            │
              └──> SmsParser ───────────┘
                                        │
          ForegroundService             │
          (keeps both receivers alive)──┘
```

---

## Project Structure

```
android-companion/
├── app/
│   ├── src/main/
│   │   ├── java/com/dreamcentre/companion/
│   │   │   ├── MainActivity.kt
│   │   │   ├── SmsReceiver.kt
│   │   │   ├── ForegroundService.kt
│   │   │   ├── SmsParser.kt
│   │   │   ├── PaymentNotificationListener.kt
│   │   │   ├── WebhookClient.kt
│   │   │   └── SettingsManager.kt
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   └── activity_main.xml
│   │   │   └── values/
│   │   │       └── strings.xml
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── build.gradle.kts
└── settings.gradle.kts
```

**Total: ~430 lines Kotlin + ~60 lines XML**

---

## Components

### 1. MainActivity.kt (~70 lines)

Configuration screen. Teacher enters webhook URL and shared secret, starts monitoring service, and grants notification access.

**UI fields:**

- Webhook URL input (text field, e.g., `https://your-site.netlify.app/api/payment-webhook`)
- Shared secret input (password field, matches `WEBHOOK_SECRET` env var on Netlify)
- Notification access status indicator (granted / not granted)
- "Grant Notification Access" button (opens system settings)
- "Start Monitoring" button
- "Test Connection" button (sends a test POST to verify webhook is reachable)
- Status indicator: service running / last payment received / connection error

**On start:**

- Validates inputs are non-empty
- Checks notification access status
- Starts `ForegroundService`
- Saves credentials to SharedPreferences via `SettingsManager`

**Notification access check:**

```kotlin
fun hasNotificationAccess(): Boolean {
    val cn = ComponentName(this, PaymentNotificationListener::class.java)
    val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
    return flat != null && flat.contains(cn.flattenToString())
}

fun requestNotificationAccess() {
    startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
}
```

Show warning if not granted: "Notification access required for payments under ₹100"

---

### 2. SmsReceiver.kt (~50 lines)

BroadcastReceiver registered for `SMS_RECEIVED`.

```kotlin
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val bundle = intent.extras ?: return
        val pdus = bundle.get("pdus") as? Array<*> ?: return

        for (pdu in pdus) {
            val sms = SmsMessage.createFromPdu(pdu as ByteArray, bundle.getString("format"))
            val sender = sms.originatingAddress ?: continue
            val body = sms.messageBody ?: continue

            if (SmsParser.isBankCreditSms(sender, body)) {
                val parsed = SmsParser.parse(body) ?: continue
                val settings = SettingsManager(context)
                WebhookClient.post(settings.getWebhookUrl(), settings.getSecret(), parsed)
            }
        }
    }
}
```

**Key behavior:**

- Registered dynamically in `ForegroundService` (not in manifest, for Android 8+ compatibility)
- Immediately passes valid bank SMS to `SmsParser`
- Ignores non-bank SMS entirely

---

### 3. ForegroundService.kt (~50 lines)

Keeps the `SmsReceiver` alive on Android 8+ which restricts implicit broadcasts. The `NotificationListenerService` runs independently (managed by the system) and doesn't need this service.

```kotlin
class ForegroundService : Service() {
    private var smsReceiver: SmsReceiver? = null

    override fun onCreate() {
        super.onCreate()
        // Create notification channel (Android 8+)
        val channel = NotificationChannel("payment_monitor", "Payment Monitor",
            NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)

        // Foreground notification
        val notification = NotificationCompat.Builder(this, "payment_monitor")
            .setContentTitle("DC Payment Monitor")
            .setContentText("Listening for payments...")
            .setSmallIcon(R.drawable.ic_notification)
            .build()
        startForeground(1, notification)

        // Register SMS receiver
        smsReceiver = SmsReceiver()
        val filter = IntentFilter("android.provider.Telephony.SMS_RECEIVED")
        registerReceiver(smsReceiver, filter)
    }

    override fun onDestroy() {
        unregisterReceiver(smsReceiver)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
```

---

### 4. SmsParser.kt (~120 lines)

Core parsing logic. Handles both bank SMS and UPI app notification formats.

#### Filter: Is this a bank credit SMS?

```kotlin
val bankSenders = mapOf(
    "HDFCBK" to "HDFC", "JD-HDFCBK" to "HDFC",
    "SBIINB" to "SBI", "SBSMS" to "SBI",
    "ICICIB" to "ICICI",
    "AXISBK" to "Axis", "AXISBANK" to "Axis",
    "KOTAKB" to "Kotak", "KOTAK" to "Kotak",
    "PNBSMS" to "PNB",
    "BOIIND" to "BOI",
    "CANBNK" to "Canara",
    "UBOIB" to "Union",
    "CENTBNK" to "Central"
)

fun isBankCreditSms(sender: String, body: String): Boolean {
    val isBank = bankSenders.keys.any { sender.contains(it, ignoreCase = true) }
    if (!isBank) return false

    val hasCredit = body.contains("credited", ignoreCase = true) ||
                    body.contains("received", ignoreCase = true) ||
                    body.contains("deposited", ignoreCase = true)
    val hasAmount = Regex("""Rs\.?\s*[\d,]+\.\d{2}""").containsMatchIn(body)
    val isOtp = body.contains("OTP", ignoreCase = true) ||
                body.contains("do not share", ignoreCase = true)
    val isPromo = body.contains("offer", ignoreCase = true) ||
                  body.contains("click here", ignoreCase = true)
    val isBalance = body.contains("available balance", ignoreCase = true) &&
                    !body.contains("credited", ignoreCase = true)

    return hasCredit && hasAmount && !isOtp && !isPromo && !isBalance
}
```

#### Extract amount

```kotlin
fun extractAmount(body: String): String? {
    val patterns = listOf(
        Regex("""Rs\.?\s*([\d,]+\.\d{2})\s*(?:has been\s*)?credited"""),
        Regex("""credited.*?Rs\.?\s*([\d,]+\.\d{2})"""),
        Regex("""received\s+Rs\.?\s*([\d,]+\.\d{2})"""),
        Regex("""Rs\.?\s*([\d,]+\.\d{2}).*?(?:UPI|IMPS|NEFT)""")
    )
    for (p in patterns) {
        val match = p.find(body)?.groupValues?.get(1)
        if (match != null) return match.replace(",", "")
    }
    return null
}
```

#### Extract UPI reference number

```kotlin
fun extractUpiRef(body: String): String? {
    val patterns = listOf(
        Regex("""(?:UPI[/-]?\s*)(\d{12})"""),
        Regex("""(?:Ref(?:erence)?[:\s]*)(\d{10,16})"""),
        Regex("""(?:IMPS[/-])(\d{12})"""),
        Regex("""(?:Tran(saction)?[:\s]*)(\d{10,16})""")
    )
    for (p in patterns) {
        val match = p.find(body)?.groupValues?.lastOrNull()
        if (match != null) return match
    }
    return null
}
```

#### Extract sender name

```kotlin
fun extractSenderName(body: String): String? {
    val patterns = listOf(
        Regex("""from\s+([A-Za-z\s]+?)(?:\s+UPI|\s+Ref|\s*$)"""),
        Regex("""by\s+([A-Za-z\s]+?)(?:\s*/|\s*UPI|\s*$)"""),
        Regex("""UPI/\d{12}/([A-Za-z\s]+)""")
    )
    for (p in patterns) {
        val match = p.find(body)?.groupValues?.get(1)?.trim()
        if (!match.isNullOrBlank() && match.length > 2) return match
    }
    return null
}
```

#### Parse result data class

```kotlin
data class ParsedPayment(
    val amount: String,
    val reference: String?,
    val sender: String?,
    val bank: String,
    val timestamp: Long = System.currentTimeMillis()
)
```

#### Master parse function (SMS)

```kotlin
fun parse(sender: String, body: String): ParsedPayment? {
    val amount = extractAmount(body) ?: return null
    val ref = extractUpiRef(body)
    val name = extractSenderName(body)
    val bank = bankSenders.entries.first { sender.contains(it.key, ignoreCase = true) }.value
    return ParsedPayment(amount, ref, name, bank)
}
```

---

### 7. NotificationListenerService.kt (~80 lines)

Reads notifications from UPI apps (GPay, PhonePe, Paytm, BHIM, etc.). This is the **primary** detection channel because it works for ALL amounts, including < ₹100.

```kotlin
class PaymentNotificationListener : NotificationListenerService() {

    private val upiApps = mapOf(
        "com.google.android.apps.nbu.paisa.user" to "GPay",
        "com.phonepe.app" to "PhonePe",
        "net.one97.paytm" to "Paytm",
        "in.org.npci.upiapp" to "BHIM",
        "com.csam.icici.bank.imobile" to "iMobile",
        "com.sbi.upi" to "SBI Pay",
        "com.naviapp" to "Navi",
        "com.bharatpe.app" to "BharatPe"
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName
        val appName = upiApps[packageName] ?: return

        val extras = sbn.notification.extras
        val title = extras.getString("android.title") ?: ""
        val text = extras.getString("android.text") ?: ""

        if (isIncomingPayment(title, text)) {
            val amount = extractAmountFromNotification(title, text)
            val sender = extractSenderFromNotification(text)
            if (amount != null) {
                val settings = SettingsManager(applicationContext)
                WebhookClient.post(
                    settings.getWebhookUrl(),
                    settings.getSecret(),
                    ParsedPayment(amount, null, sender, appName)
                )
            }
        }
    }

    private fun isIncomingPayment(title: String, text: String): Boolean {
        val keywords = listOf("received", "credited", "got", "you received", "deposited")
        return keywords.any {
            title.contains(it, ignoreCase = true) ||
            text.contains(it, ignoreCase = true)
        }
    }
}
```

#### Notification parsing (in SmsParser.kt)

```kotlin
// UPI app notifications use ₹ symbol and simpler format than bank SMS
// GPay: title="You received ₹500", text="From Rahul Sharma"
// PhonePe: title="Payment Received", text="₹500 received from Rahul"
// Paytm: title="Money Received", text="₹500 received from Rahul@paytm"

fun extractAmountFromNotification(title: String, text: String): String? {
    val combined = "$title $text"
    val pattern = Regex("""₹\s*([\d,]+(?:\.\d{2})?)""")
    return pattern.find(combined)?.groupValues?.get(1)?.replace(",", "")
}

fun extractSenderFromNotification(text: String): String? {
    val patterns = listOf(
        Regex("""from\s+([A-Za-z0-9@.\s]+?)(?:\s*$|\s*\(|\.$)"""),
        Regex("""by\s+([A-Za-z\s]+?)(?:\s*$|\.)""")
    )
    for (p in patterns) {
        val match = p.find(text)?.groupValues?.get(1)?.trim()
        if (!match.isNullOrBlank() && match.length > 2) return match
    }
    return null
}
```

#### Why notifications are better than SMS for this use case

| Feature                        | Bank SMS                        | UPI App Notification     |
| ------------------------------ | ------------------------------- | ------------------------ |
| Works for < ₹100               | ❌ (HDFC skips)                 | ✅ Always                |
| Works for third-party payments | ❌ (SMS to payer's phone)       | ✅ (on teacher's phone)  |
| Delay                          | 5-30 seconds                    | 1-2 seconds              |
| Requires bank-specific parsing | ✅ (different formats per bank) | ❌ (consistent ₹ symbol) |
| Requires special permission    | SMS permission                  | Notification access      |

---

### 5. WebhookClient.kt (~40 lines)

POSTs parsed payment data to the website webhook.

```kotlin
object WebhookClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun post(webhookUrl: String, secret: String, payment: ParsedPayment) {
        val json = JSONObject().apply {
            put("amount", payment.amount)
            put("reference", payment.reference ?: "")
            put("sender", payment.sender ?: "")
            put("bank", payment.bank)
            put("timestamp", payment.timestamp)
        }

        // HMAC-SHA256 signature for authentication
        val signature = hmacSha256(secret, json.toString())

        val request = Request.Builder()
            .url(webhookUrl)
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .header("X-Webhook-Secret", secret)
            .header("X-Webhook-Signature", signature)
            .build()

        // Retry up to 3 times
        for (attempt in 1..3) {
            try {
                val response = client.newCall(request).execute()
                if (response.isSuccessful) break
            } catch (e: Exception) {
                if (attempt == 3) Log.e("WebhookClient", "Failed after 3 attempts", e)
                Thread.sleep(5000)
            }
        }
    }

    private fun hmacSha256(secret: String, data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        return Hex.encodeHexString(mac.doFinal(data.toByteArray()))
    }
}
```

---

### 6. SettingsManager.kt (~20 lines)

SharedPreferences wrapper for persisting webhook URL and secret.

```kotlin
class SettingsManager(context: Context) {
    private val prefs = context.getSharedPreferences("companion_prefs", Context.MODE_PRIVATE)

    fun getWebhookUrl(): String = prefs.getString("webhook_url", "") ?: ""
    fun setWebhookUrl(url: String) = prefs.edit().putString("webhook_url", url).apply()

    fun getSecret(): String = prefs.getString("secret", "") ?: ""
    fun setSecret(secret: String) = prefs.edit().putString("secret", secret).apply()
}
```

---

## AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.RECEIVE_SMS" />
    <uses-permission android:name="android.permission.READ_SMS" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />

    <application
        android:allowBackup="true"
        android:label="DC Payment Monitor"
        android:theme="@style/Theme.Material3.Light">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- SMS receiver is registered dynamically in ForegroundService -->

        <service
            android:name=".ForegroundService"
            android:foregroundServiceType="specialUse"
            android:exported="false" />

        <!-- Notification listener for UPI app notifications -->
        <service
            android:name=".PaymentNotificationListener"
            android:exported="false"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>

    </application>
</manifest>
```

---

## Build & Install

### Prerequisites

- Android Studio (Hedgehog or newer)
- JDK 17+
- Android SDK 34 (compileSdk), min SDK 26

### Steps

1. Open `android-companion/` in Android Studio
2. Sync Gradle
3. Build → Build Bundle(s) / APK(s) → Build APK(s)
4. APK output: `app/build/outputs/apk/debug/app-debug.apk`
5. Transfer APK to teacher's phone (USB, email, Drive)
6. Install (enable "Install from unknown sources" if needed)
7. Open app, grant SMS permission when prompted
8. Grant Notification Access: Settings → Apps → Special Access → Notification Access → Enable for DC Payment Monitor
9. Enter webhook URL and shared secret
10. Tap "Start Monitoring"
11. Verify notification appears: "DC Payment Monitor - Listening for payments..."

### Battery Optimization

Some phones aggressively kill background services. Guide the teacher to:

- Settings → Apps → DC Payment Monitor → Battery → Unrestricted
- Or: Settings → Battery → Battery Optimization → Exclude DC Payment Monitor

---

## Testing

### Without a real bank SMS

Use ADB to simulate an SMS:

```bash
# Send a test SMS from command line
adb shell service call isms 7 i32 0 s16 "com.android.mms.service" s16 "HDFCBK" s16 "null" s16 "Rs.507.32 credited to a/c XX1234 on 12-Mar-26 from Rahul Sharma UPI Ref 430686551035" i64 0 i64 0
```

Or use Android Studio's Emulator → Settings → Phone → Send SMS.

### Test webhook separately

```bash
curl -X POST https://your-site.netlify.app/api/payment-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-here" \
  -d '{"amount":"507.32","reference":"430686551035","sender":"Rahul Sharma","bank":"HDFC","timestamp":1710249000000}'
```

---

## Known Limitations

| Limitation                                         | Impact                                                                                           | Workaround                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| No iOS version                                     | Teacher with iPhone can't use auto-detect                                                        | Use manual admin confirmation                                                                                |
| SMS format varies by bank                          | Some banks may not match regex                                                                   | NotificationListenerService catches UPI app notifications as primary channel; add new SMS patterns as needed |
| Android kills background services                  | SMS receiver may stop                                                                            | Foreground service + battery exemption; notification listener runs independently by the system               |
| Notification listener killed by OS                 | Stops catching UPI notifications                                                                 | Battery exemption + re-check access on app open; user can re-grant                                           |
| Some UPI apps don't show useful notifications      | Miss payments from those apps                                                                    | SMS channel catches bank-side notifications as fallback                                                      |
| QR code payments may not trigger GPay notification | Miss QR-based payments (Reddit: notifications fire for mobile number payments but not always QR) | SMS catches bank notification; student clicks "I have paid" as final fallback                                |

---

## Future Enhancements

1. **Payment history** — Log of all detected payments in the app, with source (notification vs SMS)
2. **Multiple webhook support** — Send to multiple URLs
3. **Bank selector** — Let teacher choose which bank to optimize SMS parsing for
4. **Duplicate detection** — If both notification and SMS fire for same payment, deduplicate by amount + timestamp window
5. **iOS version** — Would need a different approach (no SMS BroadcastReceiver or NotificationListenerService; could use notification forwarding or manual entry)
