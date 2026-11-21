# FinStack

FinStack is a personal and family finance tracker for the web, iOS, and Android. Its shared ledger connects bank imports, UPI payments, income, investments, subscriptions, budgets, and reports.

## Features

- **Activity and statistics.** Home shows income received, actual spending, and net for the current month. Review spending by month, category, and vendor. Import CSV or Excel statements, review duplicates, and group offsetting transactions for reimbursements and repayments. The mobile app opens the imported period for review, then returns to the current month on your next Activity visit.
- **Vendors and categories.** See vendor transactions, monthly spending, and recorded products. Create categories and reuse a saved vendor’s category when recording a scanned UPI payment.
- **UPI.** Scan a QR code on mobile, open your UPI app, and record the payment after that app shows success. You can also import a UPI payment screenshot to extract details with Gemini.
- **Income and investments.** Track regular or variable income and link actual receipts. Record fixed deposit terms and maturity instructions, link funding and payouts, and track stock purchases, dividends, holdings, and sale history.
- **Subscriptions and family.** Track renewals, upcoming charges, budgets, member access, and family spending. Clear renewal matches from bank statements update the subscription’s price timeline. Link a payment yourself when the merchant or billing cycle is ambiguous. The standalone Recurring Payments screen is retired. The legacy API remains available for existing records.
- **Tax and reports.** Compare tax regimes using recorded income and eligible paid amounts. Export available reports as PDF or Excel.

## Local development

Use the Node.js 26 LTS security release specified in [`.nvmrc`](.nvmrc), pnpm 10, and a MongoDB instance. The mobile app also needs Flutter and the iOS or Android SDK.

1. Run `nvm install` and `nvm use` from the repository root.
2. Copy [`backend/.env.example`](backend/.env.example) to `backend/.env`. Set the MongoDB URI and a local session secret. Use a separate development database from the hosted app.
3. Start the API and web app in separate terminals.

   **API**

   ```sh
   cd backend
   pnpm install --frozen-lockfile
   pnpm dev
   ```

   **Web**

   ```sh
   cd frontend
   pnpm install --frozen-lockfile
   pnpm dev
   ```

The website runs at `http://localhost:5173`. Vite forwards `/api` to the API on port 3000. Check the API at `http://localhost:3000/api/health`.

To run the mobile app, use `flutter pub get` and `flutter run` from [`fintrack_flutter`](fintrack_flutter). It connects to the hosted API by default. To test another server, open the app’s server settings and enter a URL reachable from the device.

### Backend environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. `mongo_uri_production` and `MONGODB_ATLAS_URI` take precedence if set. The local fallback is `mongodb://127.0.0.1:27017/fintrack`. |
| `SESSION_SECRET` | Secret for signing session cookies. Set a strong secret in production. |
| `PORT` | API port. Defaults to 3000 locally. Render supplies its own value. |
| `GEMINI_API_KEY` | Required for UPI screenshot extraction. CSV and Excel imports and tax estimates run on the API. |
| `CORS_ORIGIN` | Optional comma-separated list of additional trusted origins for direct browser API calls. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Optional SMTP configuration for app email. |

## Hosted web sessions

Vercel builds [`frontend`](frontend) with Node.js 26 LTS. [`frontend/vercel.json`](frontend/vercel.json) forwards the website’s `/api/*` requests to the Render service before the single-page app fallback. For a different backend, update the rewrite destination. [`render.yaml`](render.yaml) configures the backend, its Node.js version, and deployment settings.

The browser stores a first-party, host-only `fintrack.sid` cookie for the website. It is HttpOnly, SameSite=Lax, Secure in production, and backed by a seven-day MongoDB session. This keeps login and session refresh on the same origin in browsers that block third-party cookies, including Safari on iPhone. The native app connects to Render directly and manages its session separately.

When upgrading an existing installation, release the frontend rewrite first, then the backend cookie change. Users may need to sign in once on the website so it can create the first-party cookie.

## UPI payment status

FinStack hands the scanned payment request to your chosen UPI app. That app displays the payment status. If the UPI app reports a decline, check its transaction history and your bank account before you retry. If it confirms failure and no money was debited, you can scan the original QR in the UPI app and record the payment in FinStack after it succeeds. [NPCI UPI FAQ](https://www.npci.org.in/what-we-do/upi/faqs) · [Google Pay transaction status](https://support.google.com/pay/india/answer/16920039)

## API and checks

API groups are mounted under `/api`. The main groups are `auth`, `dashboard`, `transactions`, `imports`, `vendors`, `recipients`, `budgets`, `analytics`, `income`, `subscriptions`, `investments`, `families`, `members`, `tax`, `reports`, and `notifications`.

| Directory | Checks |
| --- | --- |
| `backend` | `pnpm test` |
| `frontend` | `pnpm test`, `pnpm lint`, `pnpm build` |
| `fintrack_flutter` | `flutter analyze`, `flutter test` |

See [LICENSE](LICENSE) for usage terms.
