# Billing & Subscription Architecture

This document serves as the **Single Source of Truth** for all billing, subscription, and credit logic within AutoPromote. Use this reference when updating pricing, adding providers, or debugging payment flows.

## 1. Billing Providers & Strategy

We operate on a **Hybrid Model**:

1.  **Subscriptions (Recurring):** Monthly/Yearly plans for platform feature access.
2.  **Credits (Pay-As-You-Go):** "Growth Credits" coin system for specific actions (AI processing, boosts).

| Provider    | Purpose                                   | Regions      | Status    |
| :---------- | :---------------------------------------- | :----------- | :-------- |
| **PayPal**  | Subscriptions & One-time Credit Purchases | Global       | ✅ Active |
| **PayFast** | One-time Credit Purchases (ZAR)           | South Africa | ✅ Active |

---

## 2. Subscription Tiers (Recurring)

Defined in: `src/routes/paypalSubscriptionRoutes.js`
UI Component: `frontend/src/components/PayPalSubscriptionPanel.js`

| Tier Name   | ID        | Price (USD) | PayPal Plan ID (Env Var) | Key Features                                                        |
| :---------- | :-------- | :---------- | :----------------------- | :------------------------------------------------------------------ |
| **Free**    | `free`    | $0.00       | N/A                      | 5 Uploads, Basic Analytics, Watermark                               |
| **Pro**     | `pro`     | $29.99      | `PAYPAL_PRO_PLAN_ID`     | Unlimited Uploads, No Watermark, Priority Support                   |
| **Premium** | `premium` | $9.99       | `PAYPAL_PREMIUM_PLAN_ID` | **Best Value**: AI Clips, Cross-Platform Auto, Viral Boosts (3x/mo) |

**Note regarding Premium vs Pro**: Historically, "Pro" might appear more expensive in legacy config, but "Premium" is the current focused tier with AI features. Check `paypalSubscriptionRoutes.js` for the active source of truth on feature flags.

---

## 3. Credit Packages (Pay-As-You-Go)

Defined in: `frontend/src/EngagementMarketplace.js` and `src/routes/paymentsExtendedRoutes.js`
Used for: AI Video Processing, "Wolf Pack" Community Boosts, Marketplace Bounties.

| Package Name    | ID            | Credits | Price (USD) | Cost/Credit |
| :-------------- | :------------ | :------ | :---------- | :---------- |
| **Cub Snack**   | `pack_small`  | 50      | $4.99       | ~$0.10      |
| **Wolf Meal**   | `pack_medium` | 150     | $12.99      | ~$0.08      |
| **Alpha Feast** | `pack_large`  | 500     | $39.99      | ~$0.07      |

**Conversion Logic**:

- Credits are stored in Firestore `users/{uid}.credits` (or `user_credits` collection).
- 1 Credit ≈ $0.10 value roughly, but abstracted for gamification.

---

## 4. Feature Billing Map (Where Money Meets Code)

| Feature              | Billing Type | Implementation File                                  | Logic                                                                                               |
| :------------------- | :----------- | :--------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **Video Processing** | Credits      | `frontend/src/components/VideoEditor.js`             | Checks credit balance before calling AI processing. Costs calculated dynamically based on duration. |
| **AI Clips (Viral)** | Credits      | `frontend/src/UserDashboardTabs/ClipStudioPanel.js`  | `402 Payment Required` triggers if insufficient credits.                                            |
| **Upload Quota**     | Subscription | `frontend/src/ContentUploadForm.js`                  | Checks `user.tier` vs limits. Blocks upload if limit reached.                                       |
| **Viral Boost**      | Credits      | `frontend/src/EngagementMarketplace.js`              | Deducts credits to create a "Bounty" in the community feed.                                         |
| **Subscription UI**  | Subscription | `frontend/src/components/PayPalSubscriptionPanel.js` | Handles upgrade/downgrade UI, PayPal Buttons.                                                       |
| **Public Pricing**   | Display      | `frontend/src/Pricing.js`                            | Wraps the SubscriptionPanel for public view.                                                        |

---

## 5. Database Schema Reference

**`users` Collection**:

```json
{
  "uid": "user_123",
  "email": "user@example.com",
  "subscription": {
    "planId": "premium", // free, pro, premium
    "status": "active", // active, cancelled, past_due
    "provider": "paypal",
    "subscriptionId": "I-123456789"
  },
  "credits": 150, // Available wallet balance
  "usage": {
    "uploads_this_month": 5,
    "ai_clips_generated": 10
  }
}
```

**`transactions` Collection**:

```json
{
  "userId": "user_123",
  "type": "CREDIT_PURCHASE", // or SUBSCRIPTION_PAYMENT
  "amount": 12.99,
  "currency": "USD",
  "provider": "PAYPAL", // or PAYFAST
  "creditsAdded": 150,
  "timestamp": "ISO_DATE"
}
```

## 6. Update Protocols

When changing a price or plan:

1.  **PayPal Dashboard**: Update the Plan ID in PayPal first.
2.  **Environment Variables**: Update `.env` (e.g., `PAYPAL_PREMIUM_PLAN_ID`) in Backend.
3.  **Backend Config**: Update `src/routes/paypalSubscriptionRoutes.js`.
4.  **Frontend Config**: Update usage limits or display text in `PayPalSubscriptionPanel.js`.
5.  **Documentation**: Update this file (`BILLING_ARCHITECTURE.md`).
