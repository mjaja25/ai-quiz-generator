# Registration & Payment Verification — Implementation Plan

## Overview

A zero-cost examinee registration system with real-time UPI payment verification via a custom Android companion app. Students register on the website, pay via Google Pay, and get automatically assigned a roll number + WhatsApp group link upon payment confirmation.

**Zero recurring costs. No payment gateway. No third-party dependencies.**

---

## Architecture

```
Student Browser                    Teacher's Phone              Netlify Backend
     │                                  │                            │
     │  1. Fill registration form       │                            │
     │───────────────────────────────────────────────────────────────>│
     │                                  │                            │
     │  2. Receive QR code + amount     │                            │
     │<───────────────────────────────────────────────────────────────│
     │                                  │                            │
     │  3. Scan QR, pay via UPI         │                            │
     │───────────> Google Pay           │                            │
     │                                  │                            │
     │              4. Bank sends SMS ──>│                            │
     │                                  │                            │
     │              5. App parses SMS,  │                            │
     │                 POSTs webhook ─────────────────────────────────>│
     │                                  │                            │
     │  6. Page auto-updates:           │         7. Match payment,  │
     │     "Confirmed! Roll No: 123456" │            assign roll no  │
     │<───────────────────────────────────────────────────────────────│
     │                                  │                            │
     │  8. Show WhatsApp group link     │                            │
```

---

## Component 1: UPI QR Code Generation (Website)

### How UPI Payments Work

A UPI payment is a simple URL:

```
upi://pay?pa=DREAMCENTRE@upi&pn=Dream+Centre&am=497.32&cu=INR&tr=DC20260312001
```

| Parameter | Meaning                                    |
| --------- | ------------------------------------------ |
| `pa`      | Payee VPA (your UPI ID, static)            |
| `pn`      | Payee name (displayed in UPI app)          |
| `am`      | Amount in rupees (unique per registration) |
| `cu`      | Currency (always INR)                      |
| `tr`      | Transaction reference (our order ID)       |

### Unique Amount Strategy

Each registration gets a unique amount to enable matching:

- Base fee: ₹500 (configurable per batch)
- Unique offset: random decimal between 0.01 and 9.99
- Example: ₹500 + 7.32 = ₹507.32
- With 2 decimal places, we get 999 unique variations per ₹1
- Collision probability: near-zero for batches under 500

### QR Code Generation

Use `qrcode.js` library (CDN, no install needed):

```js
function generateUpiQR(vpa, name, amount, orderId) {
  const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tr=${orderId}`;
  // Render QR to canvas or image
  QRCode.toCanvas(canvas, upiUrl, { width: 250 });
  return upiUrl;
}
```

### Implementation

- ~30 lines JS
- Add `qrcode.js` via CDN: `https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js`
- QR displayed on the registration confirmation page
- Also show a "Copy UPI link" button for manual entry

---

## Component 2: Registration Page (Website)

### Registration Form

Fields:

- Name (required, text)
- Phone (required, 10-digit Indian mobile)
- Email (optional, for confirmation)
- Batch (auto-selected from URL parameter or dropdown)

### Flow (Phone — primary path)

```
1. Student opens: /register?batch=DC202603 on their phone
2. Fills form, clicks "Register"
3. POST to /api/register-student
4. Response: { orderId, amount, upiDeepLink, qrDataUrl }
5. Page shows: "Pay ₹507.32" button (opens GPay directly via UPI deep link)
6. Student taps button → GPay opens → pays → returns to browser
7. Browser detects return via visibilitychange event
8. Page polls GET /api/order-status?orderId=... every 3s for 30s
9. When webhook confirms: page auto-updates
10. Shows: roll number + WhatsApp group link
```

### Flow (Computer — fallback path)

```
1. Student opens registration on computer
2. Fills form, clicks "Register"
3. Page shows QR code + amount
4. Student scans QR with phone's UPI app → pays
5. Student clicks "I have paid" button on computer
6. Page shows: "Waiting for verification..." (status = CLAIMED)
7. Admin dashboard shows claimed payment
8. Teacher verifies in bank app → clicks Confirm
9. Student's page auto-updates (polling) → shows roll number + WhatsApp link
```

### Flow (Third-party payment)

```
1. Student registers on any device
2. Someone else (parent/friend) pays from their UPI app
3. Companion app on teacher's phone detects via NotificationListenerService
4. Webhook fires → auto-confirms
5. Student's page auto-updates → shows roll number + WhatsApp link
6. If companion app misses it: student clicks "I have paid" → teacher manually confirms
```

### Auto-Refresh Mechanism

```js
// After showing QR/deep link, start polling
const pollInterval = setInterval(async () => {
  const res = await fetch(`/api/order-status?orderId=${orderId}`);
  const data = await res.json();
  if (data.status === "CONFIRMED") {
    clearInterval(pollInterval);
    showConfirmation(data.rollNo, data.whatsappLink);
  } else if (data.status === "CLAIMED") {
    showClaimedStatus(); // "Waiting for teacher verification..."
  }
}, 3000); // Check every 3 seconds
```

### Browser Return Detection (phone path)

```js
// Detect when student returns from GPay to browser
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && paymentPending) {
    // Immediately check status (don't wait for next poll tick)
    checkPaymentStatus();
  }
});
```

### "I have paid" Button

```js
// Shown after QR/deep link is displayed for > 30 seconds
function claimPayment() {
  fetch(`/api/claim-payment`, {
    method: "POST",
    body: JSON.stringify({ orderId, phone: studentPhone }),
  });
  showStatus("CLAIMED", "Waiting for teacher verification...");
}
```

### Implementation

- ~250 lines HTML (form + QR display + deep link button + confirmation + "I have paid")
- ~200 lines JS (form handling, QR generation, UPI deep link, polling, visibility detection, claim flow)
- New section in index.html OR separate page

---

## Component 3: Netlify Functions (Backend)

### 3a. `register-student.js`

Creates a new registration and writes to Google Sheet.

```
POST /api/register-student
Body: { name, phone, email, batchId }

Flow:
1. Validate inputs (name non-empty, phone 10 digits)
2. Look up batch config from Google Sheet (fee, VPA, WhatsApp link)
3. Generate unique orderId: DC + date + sequence
4. Generate unique amount: baseFee + random(0.01, 9.99)
5. Write row to Google Sheet: [orderId, name, phone, email, amount, "PENDING", "", "", timestamp, ""]
6. Generate UPI deep link: `upi://pay?pa=VPA&pn=NAME&am=AMOUNT&cu=INR&tr=ORDERID`
7. Return: { orderId, amount, upiDeepLink, qrDataUrl, baseFee, batchName }

~80 lines JS
```

### 3b. `payment-webhook.js`

Receives payment notification from Android companion app.

```
POST /api/payment-webhook
Headers: X-Webhook-Secret: (shared secret)
Body: { amount, reference, sender, bank, timestamp }

Flow:
1. Verify webhook secret (prevent unauthorized calls)
2. Look up registration by amount in Google Sheet (status = PENDING)
3. Verify time window: payment within 15 min of registration
4. Optional: verify sender name matches student name (fuzzy match)
5. Update row: status = "CONFIRMED", rollNo = next sequential, paymentRef = reference
6. Return: { success, rollNo, studentName }

~80 lines JS
```

### 3c. `order-status.js`

Checks payment status (polled by student's page).

```
GET /api/order-status?orderId=DC20260312001

Flow:
1. Look up order in Google Sheet by orderId
2. Return: { status, rollNo, whatsappLink }

Status values: PENDING | CLAIMED | CONFIRMED | EXPIRED

~50 lines JS
```

### 3d. `claim-payment.js`

Student claims they paid (fallback when auto-detection fails).

```
POST /api/claim-payment
Body: { orderId, phone }

Flow:
1. Look up order in Google Sheet by orderId
2. Verify phone matches registration
3. Update status to CLAIMED (not CONFIRMED)
4. Teacher sees CLAIMED registrations in admin dashboard
5. Teacher manually verifies and confirms

~40 lines JS
```

### 3d. `create-batch.js`

Teacher creates a new exam batch.

```
POST /api/create-batch
Body: { batchName, examFee, examDate, numQuestions, whatsappGroupName }

Flow:
1. Create WhatsApp group via Cloud API (name: batchName)
2. Generate invite link via Cloud API
3. Write batch config to Google Sheet
4. Return: { batchId, whatsappLink, registrationUrl }

~80 lines JS
```

### 3e. `get-batches.js`

Lists all batches for the admin dashboard.

```
GET /api/get-batches

Flow:
1. Read batch list from Google Sheet
2. Return: [{ batchId, name, fee, date, registeredCount, confirmedCount }]

~40 lines JS
```

### Total Backend: ~330 lines JS across 5 functions

---

## Component 4: Google Sheets as Database

### Sheet Structure

**Sheet 1: Batches**

| Batch ID | Name             | Fee | Exam Date  | VPA       | WhatsApp Link                 | Num Questions | Num Options | Roll Digits | Status |
| -------- | ---------------- | --- | ---------- | --------- | ----------------------------- | ------------- | ----------- | ----------- | ------ |
| DC202603 | Physics Mar 2026 | 500 | 2026-03-20 | dream@upi | https://chat.whatsapp.com/xxx | 100           | 4           | 6           | ACTIVE |

**Sheet 2: Registrations**

| Order ID      | Batch ID | Name  | Phone      | Email      | Amount | Status    | Roll No | Payment Ref  | Timestamp           | WhatsApp Joined |
| ------------- | -------- | ----- | ---------- | ---------- | ------ | --------- | ------- | ------------ | ------------------- | --------------- |
| DC20260312001 | DC202603 | Rahul | 9876543210 | r@mail.com | 507.32 | CONFIRMED | 123456  | 430686551035 | 2026-03-12 14:30:00 | TRUE            |

### Google Sheets API Access

- Create a Google Cloud project
- Enable Google Sheets API
- Create a service account
- Download JSON credentials
- Share the Google Sheet with the service account email
- Store credentials in Netlify env vars as `GOOGLE_SERVICE_ACCOUNT_KEY`

### Implementation

- Use `googleapis` npm package in Netlify Functions
- Or use the simpler `google-spreadsheet` package
- Each function reads/writes to the shared sheet

---

## Component 5: Android Companion App (separate project)

> **Full plan:** See `ANDROID_COMPANION_PLAN.md`

The companion app is a standalone Android project that runs on the teacher's phone. It auto-detects incoming bank payment SMS and POSTs the details to our webhook in real-time. Without it, payment confirmation falls back to manual admin verification.

### What It Does (summary)

1. Listens for incoming SMS via `BroadcastReceiver`
2. Filters out OTP, promotional, and balance-check SMS
3. Parses bank credit SMS to extract: amount, UPI reference, sender name
4. POSTs extracted data to our webhook endpoint
5. Runs persistently via a foreground service (Android 8+)

### Key Design Decisions

- **Tech:** Kotlin, minimum SDK 26 (Android 8.0), Android Studio project
- **SMS matching:** Regex patterns for major Indian banks (HDFC, SBI, ICICI, Axis, Kotak, PNB, etc.)
- **Authentication:** Shared secret (env var) sent in webhook header
- **Persistence:** Foreground service with persistent notification
- **Build:** APK installed directly on teacher's phone (no Play Store needed)

### Webhook Contract (what the app sends)

```
POST /api/payment-webhook
Headers:
  X-Webhook-Secret: {shared-secret}
Body:
{
  "amount": "507.32",
  "reference": "430686551035",
  "sender": "Rahul Sharma",
  "bank": "HDFC",
  "timestamp": 1710249000000
}
```

### Fallback Without the App

If the companion app is not available (e.g., teacher uses iPhone), the admin dashboard supports manual payment confirmation:

- Teacher sees pending registrations with amounts
- Checks bank app on phone
- Clicks "Confirm" next to matching entry
- Student page updates immediately

---

## Component 6: WhatsApp Cloud API Integration

### Setup (One-Time)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a Meta Business Account
3. Create an App → Add WhatsApp product
4. Get test phone number (free for development)
5. Get permanent access token
6. Store in Netlify env vars: `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`

### Group Management API Calls

#### Create Group

```
POST https://graph.facebook.com/v21.0/{phone-id}/groups
Authorization: Bearer {access-token}
Content-Type: application/json

{
  "subject": "DC Physics Batch Mar 2026",
  "participants": []
}

Response: { "id": "group_id_here" }
```

#### Generate Invite Link

```
POST https://graph.facebook.com/v21.0/{group-id}/invite_link
Authorization: Bearer {access-token}

Response: { "invite_link": "https://chat.whatsapp.com/xxxxxxxxx" }
```

#### Implementation in `create-batch.js`

```js
async function createWhatsAppGroup(groupName, accessToken, phoneId) {
  // Create group
  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/groups`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject: groupName, participants: [] }),
    },
  );
  const { id: groupId } = await createRes.json();

  // Get invite link
  const linkRes = await fetch(
    `https://graph.facebook.com/v21.0/${groupId}/invite_link`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const { invite_link } = await linkRes.json();

  return { groupId, inviteLink: invite_link };
}
```

### Cost

| Action               | Cost                                |
| -------------------- | ----------------------------------- |
| Create group         | Free                                |
| Generate invite link | Free                                |
| Send messages        | $0.005/msg (we don't send messages) |
| **Our usage**        | **Free**                            |

Students click the link from the website — no WhatsApp message is sent by us.

---

## Admin Dashboard (Website)

### Teacher's View

A new "Registration" tab alongside Quiz Generator and OMR Sheet:

```
┌─────────────────────────────────────────────────┐
│  Registration Dashboard                         │
│                                                 │
│  Active Batch: Physics Mar 2026                 │
│  Fee: ₹500  |  Exam: 2026-03-20                │
│  WhatsApp Group: [Link]  |  Reg. URL: [Copy]   │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Total Registered: 145                  │    │
│  │  Confirmed (Paid): 132                  │    │
│  │  Pending Payment:  13                   │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Recent Registrations:                          │
│  ┌──────────────────────────────────────────┐   │
│  │ Name      | Phone      | Status  | Roll  │   │
│  │ Rahul K.  | 98765****  | ✓ Conf  | 123456│   │
│  │ Priya S.  | 91234****  | ✓ Conf  | 123457│   │
│  │ Amit R.   | 99887****  | ○ Pend  |   —   │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  [Create New Batch]  [Export CSV]  [Refresh]    │
└─────────────────────────────────────────────────┘
```

### Features

- View all registrations with status (PENDING / CLAIMED / CONFIRMED)
- Manual payment confirmation (fallback for failed auto-detect)
- "Claimed" tab showing students who clicked "I have paid" — one-click confirm
- Export registration data as CSV
- Create new batch (triggers WhatsApp group creation)
- Copy registration URL to share with students
- Real-time update via polling (every 10 seconds)

### Implementation

- ~150 lines HTML + ~100 lines JS
- Part of the OMR/Registration tab in index.html

---

## Implementation Order

| #   | Component                                    | Lines (est.) | Depends on | Priority |
| --- | -------------------------------------------- | ------------ | ---------- | -------- |
| 1   | Google Sheet setup + API access              | Config       | Nothing    | High     |
| 2   | `register-student.js` (Netlify Function)     | ~90          | #1         | High     |
| 3   | `order-status.js` (Netlify Function)         | ~50          | #1         | High     |
| 4   | `claim-payment.js` (Netlify Function)        | ~40          | #1         | High     |
| 5   | Registration form + QR + deep link (Website) | ~450         | #2, #3, #4 | High     |
| 6   | `payment-webhook.js` (Netlify Function)      | ~80          | #1         | High     |
| 7   | `create-batch.js` + WhatsApp API             | ~80          | #1         | Medium   |
| 8   | Admin dashboard (Website)                    | ~280         | #2, #3, #7 | Medium   |
| 9   | `get-batches.js` (Netlify Function)          | ~40          | #1         | Medium   |
| 10  | Batch lifecycle (expire, archive, cleanup)   | ~50          | #7, #8     | Low      |

**Website total: ~730 lines JS + ~250 lines HTML**
**Backend total: ~380 lines JS across 6 Netlify Functions**
**Android companion app: ~430 lines Kotlin (see `ANDROID_COMPANION_PLAN.md`)**

---

## Environment Variables (Netlify)

| Variable                     | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON credentials for Google Sheets API               |
| `GOOGLE_SHEET_ID`            | ID of the registration spreadsheet                   |
| `WEBHOOK_SECRET`             | Shared secret for Android app webhook authentication |
| `WHATSAPP_PHONE_ID`          | WhatsApp Business phone number ID                    |
| `WHATSAPP_ACCESS_TOKEN`      | WhatsApp Cloud API permanent access token            |
| `UPI_VPA`                    | Your UPI virtual payment address (e.g., dream@upi)   |
| `UPI_PAYEE_NAME`             | Name shown in UPI app (e.g., Dream Centre)           |

---

## File Changes Summary

| File                                    | Status    | Changes                                                            |
| --------------------------------------- | --------- | ------------------------------------------------------------------ |
| `index.html`                            | Modified  | Add registration form, QR, deep link, admin dashboard (~980 lines) |
| `netlify/functions/register-student.js` | New       | Student registration + Google Sheet write + UPI deep link          |
| `netlify/functions/payment-webhook.js`  | New       | Payment confirmation from companion app                            |
| `netlify/functions/order-status.js`     | New       | Payment status check for student page                              |
| `netlify/functions/claim-payment.js`    | New       | Student claims payment (fallback)                                  |
| `netlify/functions/create-batch.js`     | New       | Batch creation + WhatsApp group                                    |
| `netlify/functions/get-batches.js`      | New       | List batches for admin                                             |
| `REGISTRATION_IMPLEMENTATION.md`        | This file | —                                                                  |
| `ANDROID_COMPANION_PLAN.md`             | Separate  | Android companion app plan (standalone project)                    |

---

## Payment Verification Flow (Detailed)

### Scenario A: Student pays from own phone (most common, auto)

```
Time 0s:    Student fills form on phone, clicks Register
Time 0.5s:  Server creates order, returns UPI deep link + amount
Time 1s:    Student taps "Pay ₹507.32" → GPay opens
Time 2s:    Student confirms payment in GPay
Time 3s:    GPay returns to browser (visibilitychange fires)
Time 3.5s:  Page polls webhook → still PENDING
Time 4s:    UPI app notification fires on teacher's phone
Time 4.5s:  NotificationListenerService catches it → POSTs webhook
Time 5s:    Webhook matches amount → status=CONFIRMED, rollNo=123456
Time 5.5s:  Student's page polls → CONFIRMED → shows roll number + WhatsApp link
```

### Scenario B: Third-party pays (parent scans QR)

```
Time 0s:    Student registers (on phone or computer)
Time 0.5s:  QR code displayed, shared with parent
Time 2s:    Parent scans QR, pays ₹507.32 from their GPay
Time 4s:    Bank SMS OR GPay notification on teacher's phone
Time 5s:    Companion app detects → webhook → CONFIRMED
Time 8s:    Student's page polls → CONFIRMED → shows roll number
```

### Scenario C: Auto-detection fails (fallback)

```
Time 0s:    Student pays from any device/app
Time 30s:   No auto-confirmation (companion app missed it)
Time 31s:   Student clicks "I have paid" button
Time 32s:   Status changes to CLAIMED
Time 33s:   Student's page shows "Waiting for teacher verification..."
Time 60s:   Teacher checks admin dashboard → sees CLAIMED entry
Time 90s:   Teacher checks bank app → sees ₹507.32 from Rahul
Time 95s:   Teacher clicks Confirm in dashboard → status=CONFIRMED
Time 98s:   Student's page polls → CONFIRMED → shows roll number
```

---

## Risks and Mitigations

| Risk                                        | Impact                             | Mitigation                                                                                               |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Companion app killed by Android             | No auto-confirmation               | Foreground service + battery exemption; notification listener runs independently; "I have paid" fallback |
| Bank SMS format changes                     | SMS parsing fails                  | NotificationListenerService as primary (consistent format); add new SMS patterns as needed               |
| Notification listener killed by OS          | Misses UPI notifications           | Battery exemption; re-check access on app open; SMS as secondary; "I have paid" as final fallback        |
| HDFC skips SMS for < ₹100                   | Small amounts not detected via SMS | NotificationListenerService catches UPI app notifications for ALL amounts                                |
| Two students get same unique amount         | Payment mismatch                   | Random decimal + collision check; probability < 0.01% for batches under 200                              |
| Student pays wrong amount                   | Payment not matched                | Show clear amount on page; webhook rejects non-exact matches; "I have paid" fallback                     |
| Student clicks "I have paid" without paying | False claim in admin dashboard     | Teacher verifies against bank statement before confirming; CLAIMED status clearly marked                 |
| Companion phone has no internet             | Webhook not sent                   | App queues payments, sends when connection restored                                                      |
| WhatsApp API rate limit                     | Group creation fails               | Only 1 group per batch (low volume); retry with backoff                                                  |
| Google Sheets API quota                     | Read/write fails                   | Batch updates instead of individual writes; cache frequently read data                                   |

---

## Future Enhancements

1. **SMS notification to student** — Send roll number via SMS after payment confirmed (using free SMS gateway or Google Apps Script)
2. **Payment reminders** — Auto-reminder to students who haven't paid within 24 hours
3. **Bulk OMR generation** — Generate personalized OMR sheets for all confirmed students in a batch (one click)
4. **Attendance tracking** — Mark students who downloaded/printed OMR sheet
5. **Multiple exam fees** — Support different fees per batch
6. **Refund tracking** — Mark refunded registrations
7. **Companion app — iOS version** — If teacher uses iPhone (harder: no SMS BroadcastReceiver on iOS, would need manual entry)
