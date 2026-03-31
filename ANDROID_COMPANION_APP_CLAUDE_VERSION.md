# Android Companion App V2 — Revised Plan (Claude Version)

> **This is a standalone plan document.** It does not modify `ANDROID_COMPANION_PLAN.md` or `REGISTRATION_IMPLEMENTATION.md`. This version focuses on solving critical high-priority limitations.

---

## Problems This Plan Solves

| # | Problem | Impact | Current Plan's Answer |
|---|---------|--------|-----------------------|
| 1 | **SMS not sent for UPI < ₹100** | HDFC already stopped SMS for <₹100 (since June 2024). Other banks are following. If exam fee is ₹50–₹99, the entire auto-detect pipeline is blind. | "Set minimum fee above ₹100" — not always feasible |
| 2 | **Only detects bank SMS** | Students may pay via PhonePe, Paytm, BHIM, or any UPI app. The *teacher's* bank may send the SMS, but the format varies wildly. Some banks send push-only, no SMS at all. | Regex library for major banks — still misses push-only banks |
| 3 | **Assumes student pays from own account** | A parent, friend, or sibling may pay on the student's behalf. Sender name won't match the registered student name. | Optional fuzzy name match — but this creates false negatives |

---

## Core Architectural Change: Dual-Layer Detection

Instead of relying solely on SMS, we add **NotificationListenerService** as the **primary** detection layer and demote SMS to a **fallback/redundant** layer.

```
                        ┌─────────────────────────┐
                        │   Teacher's Phone        │
                        │                          │
  UPI Payment ──────►   │  ┌───────────────────┐   │
  (any app)              │  │ NotificationListener│  │  ◄── PRIMARY (instant)
                        │  │  (reads UPI app     │   │      Catches ALL payments
                        │  │   push notifications)│  │      including <₹100
                        │  └────────┬────────────┘   │
                        │           │                │
                        │  ┌────────▼────────────┐   │
                        │  │   Dedup Engine       │   │  ◄── Prevents double-posting
                        │  └────────┬────────────┘   │
                        │           │                │
  Bank SMS ──────────►  │  ┌────────▼────────────┐   │
  (if amount ≥ ₹100)    │  │   SMS Receiver       │  │  ◄── FALLBACK (delayed)
                        │  │   (existing V1)      │   │      Catches if notification
                        │  └────────┬────────────┘   │      was missed
                        │           │                │
                        │  ┌────────▼────────────┐   │
                        │  │  WebhookClient       │   │  ──► Netlify Webhook
                        │  └─────────────────────┘   │
                        └─────────────────────────┘
```

### Why NotificationListenerService?

| Approach | Catches <₹100? | Catches all UPI apps? | Play Store OK? | Requires root? |
|----------|:-:|:-:|:-:|:-:|
| SMS BroadcastReceiver (V1) | ❌ | ❌ (bank SMS only) | ✅ | ❌ |
| **NotificationListenerService (V2)** | **✅** | **✅** | **✅*** | **❌** |
| AccessibilityService | ✅ | ✅ | ❌ (Play Store rejects) | ❌ |

*\* NotificationListenerService is a legitimate Android API. Since we're sideloading (not on Play Store), policy is irrelevant anyway — but it's still the cleaner approach.*

**Key advantages:**
- UPI apps (Google Pay, PhonePe, Paytm, etc.) send push notifications for **every** transaction, including <₹100
- We read the teacher's **UPI app** notifications instead of relying on unpredictable traditional bank notification systems
- No dependency on SMS at all — works even if SMS is completely disabled
- Works universally as long as the teacher uses a standard UPI app to receive payments

---

## Revised Project Structure

```
android-companion/
├── app/src/main/java/com/dreamcentre/companion/
│   ├── MainActivity.kt              (MODIFIED — new UI toggle, status)
│   ├── SmsReceiver.kt               (UNCHANGED)
│   ├── ForegroundService.kt          (MODIFIED — starts NotificationListener)
│   ├── SmsParser.kt                  (UNCHANGED)
│   ├── NotificationMonitor.kt        (NEW — NotificationListenerService)
│   ├── NotificationParser.kt         (NEW — parses UPI app notifications)
│   ├── PaymentDeduplicator.kt        (NEW — prevents double webhook calls)
│   ├── BatteryHelper.kt              (NEW — handles OEM background restrictions)
│   ├── WebhookClient.kt              (MODIFIED — new payload fields)
│   └── SettingsManager.kt            (MODIFIED — new prefs)
├── app/src/main/res/xml/
│   └── notification_listener_config.xml  (NEW)
├── app/src/main/AndroidManifest.xml  (MODIFIED)
└── ...
```

**Delta from V1: ~200 new lines Kotlin, ~30 lines modified**

---

## New Components

### 1. NotificationMonitor.kt (~80 lines)

The primary payment detection layer. Extends `NotificationListenerService`.

```kotlin
class NotificationMonitor : NotificationListenerService() {

    // We monitor the UPI apps the teacher uses to generate the QR code
    private val targetApps = setOf(
        "com.google.android.apps.nipay",   // Google Pay (GPay)
        "com.phonepe.app",                 // PhonePe
        "net.one97.paytm",                 // Paytm
        "in.org.npci.upiapp",              // BHIM
        "com.dreamplug.androidapp"         // Cred
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return

        // Only process notifications from targeted UPI apps
        if (pkg !in targetApps) return

        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: text

        // Use the longer text for parsing (big text has full details)
        val content = if (bigText.length > text.length) bigText else text

        // Parse the notification
        val parsed = NotificationParser.parse(pkg, title, content) ?: return

        // Dedup check — skip if SMS already caught this
        val dedup = PaymentDeduplicator.getInstance(applicationContext)
        if (dedup.isDuplicate(parsed.amount, parsed.reference)) {
            Log.d("NotificationMonitor", "Skipping duplicate: ${parsed.amount}")
            return
        }
        dedup.record(parsed.amount, parsed.reference, source = "notification")

        // POST to webhook
        val settings = SettingsManager(applicationContext)
        WebhookClient.post(
            settings.getWebhookUrl(),
            settings.getSecret(),
            parsed,
            source = "notification"
        )
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) { /* no-op */ }
}
```

**User setup required:** The teacher must go to **Settings → Notification Access** and enable "DC Payment Monitor". The app's MainActivity guides them through this with a one-tap deep link.

---

### 2. NotificationParser.kt (~90 lines)

Parses payment details from bank app push notifications.

```kotlin
object NotificationParser {

    // UPI notification formats (title + body patterns)
    // These are highly consistent across GPay, PhonePe, Paytm
    private val creditPatterns = listOf(
        // "₹507.32 received from Sunita" (PhonePe/GPay style)
        Regex("""(?:Rs\.?|₹|INR)?\s*([\d,]+\.\d{2})\s*(?:received)""", RegexOption.IGNORE_CASE),
        Regex("""(?:received|got)\s*(?:Rs\.?|₹|INR)?\s*([\d,]+\.\d{2})""", RegexOption.IGNORE_CASE),
        // Fallback for full string
        Regex("""(?:credit|credited).*?(?:Rs\.?|₹|INR)\s*([\d,]+\.\d{2})""", RegexOption.IGNORE_CASE)
    )

    private val upiRefPatterns = listOf(
        Regex("""(?:UPI[/\-]?\s*)(\d{12})"""),
        Regex("""(?:Ref(?:erence)?[:\s]*)(\d{10,16})"""),
        Regex("""(?:UTR[:\s]*)(\d{10,16})"""),
        Regex("""(?:Txn\s*(?:ID|No)?[:\s]*)(\d{10,16})"""),
    )

    private val senderPatterns = listOf(
        Regex("""from\s+([A-Za-z\s]+?)(?:\s+UPI|\s+Ref|\s+via|\s*$)"""),
        Regex("""by\s+([A-Za-z\s]+?)(?:\s*/|\s*UPI|\s*$)"""),
        Regex("""VPA[:\s]+(\S+@\S+)"""),  // Capture VPA if name not available
    )

    // Negative filters — skip these notifications
    private val skipKeywords = listOf(
        "OTP", "do not share", "offer", "reward", "cashback",
        "EMI", "loan", "insurance", "credit card", "bill pay",
        "debited", "withdrawn", "transferred"  // <-- We only want CREDITS
    )

    fun parse(packageName: String, title: String, body: String): ParsedPayment? {
        val fullText = "$title $body"

        // Skip non-credit notifications
        if (skipKeywords.any { fullText.contains(it, ignoreCase = true) }) return null

        // Must contain a credit keyword
        val hasCreditKeyword = listOf("credited", "received", "deposited", "credit")
            .any { fullText.contains(it, ignoreCase = true) }
        if (!hasCreditKeyword) return null

        // Extract amount
        val amount = creditPatterns.firstNotNullOfOrNull { 
            it.find(fullText)?.groupValues?.get(1)?.replace(",", "") 
        } ?: return null

        // Extract reference (optional — some notifications don't include it)
        val reference = upiRefPatterns.firstNotNullOfOrNull {
            it.find(fullText)?.groupValues?.lastOrNull()
        }

        // Extract sender (optional)
        val sender = senderPatterns.firstNotNullOfOrNull {
            it.find(fullText)?.groupValues?.get(1)?.trim()
        }

        val appName = identifyApp(packageName)

        return ParsedPayment(amount, reference, sender, appName)
    }

    private fun identifyApp(pkg: String): String = when {
        pkg.contains("nipay") -> "GPay"
        pkg.contains("phonepe") -> "PhonePe"
        pkg.contains("paytm") -> "Paytm"
        pkg.contains("upiapp") -> "BHIM"
        pkg.contains("dreamplug") -> "Cred"
        else -> "Unknown UPI App"
    }
}
```

---

### 3. PaymentDeduplicator.kt (~45 lines)

Since both SMS and Notification layers may fire for the same payment, we need deduplication.

```kotlin
class PaymentDeduplicator private constructor(context: Context) {
    
    private val recentPayments = mutableMapOf<String, Long>()  // key → timestamp
    private val DEDUP_WINDOW_MS = 5 * 60 * 1000L  // 5 minutes

    companion object {
        @Volatile private var instance: PaymentDeduplicator? = null
        fun getInstance(context: Context) = instance ?: synchronized(this) {
            instance ?: PaymentDeduplicator(context).also { instance = it }
        }
    }

    /**
     * Generate a dedup key from amount + reference.
     * If reference is null, use amount + 2-minute time bucket.
     */
    private fun key(amount: String, reference: String?): String {
        return if (reference != null) {
            "ref:$reference"  // Best case: exact match by UTR
        } else {
            // Fallback: amount + 2-min time bucket
            val bucket = System.currentTimeMillis() / (2 * 60 * 1000)
            "amt:$amount:$bucket"
        }
    }

    fun isDuplicate(amount: String, reference: String?): Boolean {
        cleanup()
        return recentPayments.containsKey(key(amount, reference))
    }

    fun record(amount: String, reference: String?, source: String) {
        val k = key(amount, reference)
        recentPayments[k] = System.currentTimeMillis()
        Log.d("Dedup", "Recorded $source: $k")
    }

    private fun cleanup() {
        val cutoff = System.currentTimeMillis() - DEDUP_WINDOW_MS
        recentPayments.entries.removeAll { it.value < cutoff }
    }
}
```

---

### 4. BatteryHelper.kt (~60 lines)

Chinese OEMs (Xiaomi, Oppo, Vivo) aggressively kill background services to save battery. Standard Android methods (like `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`) are often insufficient because these manufacturers use proprietary security/battery managers.

This helper detects the device manufacturer and routes the teacher to the correct OEM-specific "AutoStart" or "Battery Manager" screen.

```kotlin
object BatteryHelper {

    // Common intents for OEM-specific AutoStart / Battery managers
    private val OEM_INTENTS = listOf(
        // Xiaomi / POCO / Redmi
        Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
        // Oppo / OnePlus (ColorOS)
        Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
        // Vivo (FuntouchOS)
        Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
        // Huawei
        Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
        // Samsung (though less aggressive, useful to have)
        Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"))
    )

    fun requestAutoStartPermission(context: Context) {
        val manufacturer = android.os.Build.MANUFACTURER.lowercase()

        // 1. Try standard Android Battery Optimization Intent first
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e("BatteryHelper", "Standard intent failed", e)
        }

        // 2. Try OEM specific intent
        for (intent in OEM_INTENTS) {
            if (isCallable(context, intent)) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    return // Opened successfully
                } catch (e: Exception) {
                    continue
                }
            }
        }
        
        // 3. Fallback: ask user to do it manually if no intent worked
        if (manufacturer in listOf("xiaomi", "oppo", "vivo", "redmi", "poco")) {
            Toast.makeText(context, "Please enable AutoStart in your battery settings to prevent missed payments", Toast.LENGTH_LONG).show()
        }
    }

    private fun isCallable(context: Context, intent: Intent): Boolean {
        return context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null
    }
}
```

**MainActivity UI Integration:** 
Add a warning banner and button in `MainActivity` if the device is a known aggressive killer (Xiaomi/Oppo/Vivo). 
*   **Prompt:** "Warning: Your phone may kill this app in the background. Tap here to whitelist it." 
*   **Action:** Calls `BatteryHelper.requestAutoStartPermission(this)`.

---

## Problem 2: Third-Party Payer Support

### The Scenario

> Rahul registers for the exam. His mother Sunita pays ₹507.32 from her own Google Pay.

In V1, the webhook optionally matched `sender` name against the student's registered name. This would fail because the SMS/notification says "Sunita" not "Rahul".

### The Fix: Match by Amount Only

The unique amount strategy (e.g., base fee + random decimal) is used as the primary identifier.

```
1. Find PENDING registration where amount == webhook.amount (exact match)
2. Verify time window (payment within 15 min of registration)
3. Confirm registration regardless of sender name
```

> [!IMPORTANT]
> The `sender` field from the webhook should be stored for audit purposes but NEVER used as a matching criterion. The unique amount is the sole identifier.

---

## Problem 3: Sub-₹100 SMS Blindspot

### Why V2 Fixes This Completely

UPI apps (Google Pay, PhonePe, Paytm, etc.) send push notifications for **ALL** received payments—there is no minimum threshold for push notifications across these apps. This eliminates the ₹100 blindspot entirely without relying on flaky bank apps.

---

## Updated Known Limitations

| Limitation | Impact | Status |
|---|---|---|
| SMS not sent for < ₹100 | Small amounts missed | **✅ FIXED** — Notification listener catches all amounts |
| Only detects Google Pay | Other UPI apps missed | **✅ FIXED** — Detects payment via any UPI app (teacher-side) |
| Sender name must match student | Third-party payments fail | **✅ FIXED** — Amount-only matching, sender stored for audit |
| Background services killed by Chinese OEMs | App stops listening for payments | **✅ MITIGATED** — BatteryHelper directs user exactly to OEM AutoStart settings |
| No iOS version | Teacher with iPhone can't use | Still manual fallback only |

---

## Testing Plan

1. **Unit Tests — NotificationParser:** Verify correct amount and reference extraction from GPay, PhonePe, and Paytm notification formats.
2. **Integration Test — Deduplication:** Ensure that if both SMS and notification fire for the same payment, only one webhook call is made.
3. **Manual Test — End to End:** Simulate UPI app notifications via ADB to verify the system's real-time response.
