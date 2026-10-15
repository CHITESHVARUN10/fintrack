# FinTrack

A personal & family finance management platform. FinTrack helps you track income,
expenses, investments, loans, insurance, and subscriptions, and uses AI (Google
Gemini) to extract data from Form 16 PDFs and generate tax-regime recommendations.

> Built with a React + TypeScript frontend and an Express + MongoDB backend.

---

## ✨ Features

- **Dashboard** — consolidated financial summary with charts.
- **Income & Expenses** — track earnings and ad-hoc spending.
- **Subscriptions & Recurring payments** — monitor monthly/yearly commitments.
- **Investments** — track holdings, invested vs. current value.
- **Loans (EMI)** — manage loan schedules and balances.
- **Insurance** — policy tracking.
- **Education payments** — tuition and related expenses.
- **Family / Members** — multi-member household accounts.
- **Tax estimate** — quick tax liability estimates.
- **Form 16** — upload a Form 16 PDF and let Gemini extract the fields
  automatically, or enter them manually. Duplicate and edit records.
- **Tax recommendations** — AI-generated Old vs. New regime analysis with savings
  suggestions, cached and re-generated when data goes stale.
- **Notifications** — in-app alerts.
- **Auth** — session-based login/register with `passport-local`.

---

## 🧱 Tech Stack

| Layer    | Stack                                                                 |
| -------- | --------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router, Recharts     |
| Backend  | Node.js, Express 5, Mongoose, Passport (local), Express Session       |
| Database | MongoDB (with `connect-mongo` session store)                          |
| AI       | Google Gemini (`gemini-2.5-flash`) for Form 16 extraction & advice    |
| Mail     | Nodemailer (SMTP) for transactional emails                            |
| Misc     | Multer (PDF uploads), ExcelJS (reports), PDFKit (exports), Joi, bcrypt |

---

## 📁 Project Structure

```
fintrack/
├── backend/                 # Express API server
│   ├── .env                 # Local environment variables (git-ignored, tracked here — rotate if leaked)
│   ├── .env.example         # Template for required variables
│   ├── package.json
│   └── server/
│       ├── index.js         # Entry point
│       ├── app.js           # Express app + middleware + route mounting
│       ├── db.js            # MongoDB connection
│       ├── config/          # Passport + session config
│       ├── middleware/      # Auth, validation, error handling
│       ├── models/          # Mongoose schemas
│       ├── routes/          # API route groups (auth, form16, tax, ...)
│       ├── services/        # gemini.service.js, tax.service.js, cron, ...
│       └── utils/
└── frontend/                # React + Vite SPA
    ├── package.json
    └── src/
        ├── pages/           # Route pages (Dashboard, Form16*, TaxRecommendation, ...)
        ├── components/      # UI components (layout, form16, ui)
        ├── services/api.ts  # Axios service layer (mock + live modes)
        ├── data/mock.ts     # In-memory mock data
        ├── context/         # App context/state
        ├── hooks/           # Custom hooks
        ├── lib/             # Helpers
        └── types/           # TypeScript types
```

---

## 🚀 Prerequisites

- **Node.js** 20.19+ (Node 22.12+ recommended for the frontend)
- **MongoDB** — local instance or a connection string (Atlas, etc.)
- A **Google Gemini API key** (see [Environment Variables](#-environment-variables))
- An **SMTP** account if you want transactional emails (optional)

---

## 🛠️ Getting Started

### 1. Clone & install

```bash
# Backend
cd backend
npm install

# Frontend (in a separate terminal)
cd frontend
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

See [Environment Variables](#-environment-variables) for details. The backend reads
variables from `backend/.env` via `dotenv`.

### 3. Run the dev servers

```bash
# Backend (auto-restarts with --watch)
cd backend && npm run dev
# → http://localhost:3000

# Frontend (Vite dev server)
cd frontend && npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` calls to the backend, so the frontend and API
must run simultaneously during development.

### 4. Build & run for production

```bash
# Frontend
cd frontend && npm run build      # outputs to frontend/dist

# Backend
cd backend && npm start
```

---

## 🔐 Environment Variables

The backend loads these from `backend/.env`. A template is provided in
`backend/.env.example`.

| Variable          | Required | Default                              | Description                                              |
| ----------------- | -------- | ------------------------------------ | -------------------------------------------------------- |
| `MONGODB_URI`     | Yes      | `mongodb://localhost:27017/fintrack` | MongoDB connection string. `mongo_uri` is also accepted. |
| `PORT`            | No       | `3000`                               | Port the API listens on.                                 |
| `SESSION_SECRET`  | Yes      | —                                    | Secret used to sign session cookies.                     |
| `GEMINI_API_KEY`  | Yes*     | —                                    | Google Gemini API key for Form 16 extraction & advice.  |
| `CORS_ORIGIN`     | No       | `*` (reflects request origin)       | Comma-separated allowed origins (e.g. `http://localhost:5173`). |
| `SMTP_HOST`       | No       | —                                    | SMTP server host (e.g. `smtp.gmail.com`).                |
| `SMTP_PORT`       | No       | `587`                                | SMTP port.                                               |
| `SMTP_SECURE`     | No       | `false`                              | `true` for port 465 (implicit TLS).                      |
| `SMTP_USER`       | No       | —                                    | SMTP username.                                           |
| `SMTP_PASS`       | No       | —                                    | SMTP password / app password.                            |
| `EMAIL_FROM`      | No       | —                                    | `From` address for outbound email.                       |

\* `GEMINI_API_KEY` is required for live AI features. If it is missing, the Form 16
extraction and tax recommendation endpoints fall back to built-in mock data
(`gemini.service.js` → `mockForm16()` / `mockRecommendation()`), so the app still
runs end-to-end in development. **Use the env variable — never hard-code the key.**

---

## 🔌 API Overview

All routes are mounted under `/api` and require an authenticated session unless
noted. Health check: `GET /api/health`.

| Group           | Base path                       | Notes                                  |
| --------------- | ------------------------------- | -------------------------------------- |
| Auth            | `/api/auth`                     | Register, login, logout, session.      |
| Dashboard       | `/api/dashboard`                | Summary metrics + charts data.         |
| Income          | `/api/income`                   | Earnings records.                      |
| Subscriptions   | `/api/subscriptions`            | Recurring subscriptions.               |
| Recurring       | `/api/recurring`                | Recurring payments.                    |
| Investments     | `/api/investments`              | Holdings + summary.                    |
| Loans           | `/api/loans`                    | EMI / loan records.                    |
| Expenses        | `/api/expenses`                 | Ad-hoc expenses.                       |
| Insurance       | `/api/insurance`                | Insurance policies.                    |
| Education       | `/api/education`                | Education payments.                    |
| Tax             | `/api/tax`                      | Tax estimate.                          |
| Members         | `/api/members`                  | Family member accounts.                |
| Reports         | `/api/reports`                  | Exports (Excel/PDF).                   |
| Notifications   | `/api/notifications`            | In-app notifications.                  |
| **Form 16**     | `/api/form16`                   | Upload/manual/duplicate + AI advice.   |

### Form 16 endpoints

| Method | Path                              | Description                                       |
| ------ | --------------------------------- | ------------------------------------------------- |
| POST   | `/api/form16/upload`              | Upload a Form 16 **PDF** → Gemini field extraction (multipart `pdf`). |
| POST   | `/api/form16/manual`              | Create a Form 16 record manually.                 |
| POST   | `/api/form16/:id/duplicate`       | Duplicate a record (optionally set `financialYear`). |
| GET    | `/api/form16`                     | List the current user's records.                  |
| GET    | `/api/form16/:id`                 | Get one record.                                   |
| PUT    | `/api/form16/:id`                 | Update a record (marks recommendation stale).     |
| DELETE | `/api/form16/:id`                 | Delete a record (and its recommendation).         |
| GET    | `/api/form16/:id/recommendation`  | Cached, stale-aware AI tax recommendation.        |

---

## 🖥️ Frontend Notes

The frontend's `src/services/api.ts` calls the live API through the shared Axios client (`withCredentials: true`). Local development proxies `/api` to the backend. For hosted builds, set `VITE_API_URL` before building.

Transactions may be changed only by their creator. Administrators can view authorized family finances and Form 16 records, but cannot edit another member's ledger transactions or access another family's records. Revoked memberships and inactive accounts are checked on subsequent requests.

For supplemental tax deductions, use **Paid amounts for tax** on investment, insurance, loan, and education forms. Specify the financial year, section, and actual amount paid. Existing portfolio balances and scheduled EMIs/premiums are preserved as tracking data but are no longer treated automatically as paid deductions. Form 16 fields and finalized snapshots remain separate.

---

## 🧪 Scripts

**Backend**

```bash
npm run dev     # start with auto-reload (node --watch)
npm start       # start the production server
npm test        # offline backend regression tests
```

**Frontend**

```bash
npm run dev      # Vite dev server
npm run build    # type-check + production build
npm run lint     # ESLint
npm run preview  # preview the production build
npm test         # frontend regression tests
```

---

## 🔒 Security Notes

- **Secrets:** `backend/.env` holds real credentials. It is in `.gitignore`, but if
  it was committed before being ignored, rotate the keys (especially
  `GEMINI_API_KEY` and `SMTP_PASS`) and remove them from git history.
- Sessions are stored in MongoDB with a 7-day TTL; cookies are `httpOnly` with
  `sameSite: lax`, and `secure` in production (`NODE_ENV=production`).
- API rate limiting is applied via `express-rate-limit`.

---

## 📄 License

This project is proprietary. All rights reserved. Not open source.
