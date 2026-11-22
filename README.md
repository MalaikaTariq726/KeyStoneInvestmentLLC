# Key Stone Investment LLC website and Employee Access

One site, one deployment:

| Address | What it is |
| --- | --- |
| `/` | The company website (plain HTML in `public/index.html` + `public/assets/`) |
| `/login` | Employee sign-in (the "Employee Login" button on the website) |
| `/portal/...` | The employee app, the web and mobile version of the KeyStone desktop app |

The employee app shares the desktop app's MongoDB database, so accounts, claims, projects and expenses stay in sync between the two.

To edit the public website, change `public/index.html`. Everything under `src/` is the employee app.

- **Sign in:** only `@keystoneinvestmentllc.com` emails that already have an account. A 6-digit code is emailed (valid 10 minutes, 5 tries, 60-second resend cooldown). No passwords.
- **Roles:** come from the `role` field in the `users` collection (the same one the desktop app uses), re-checked on every request.
  - **Admin:** dashboard with cash flow, approve/reject claims, projects and expenses, users and roles.
  - **User:** own dashboard and credit, submit claims with receipts from a phone, track status.

## Run locally

```bash
npm install
npm run dev:db     # terminal 1: throwaway test database with sample data
npm run dev        # terminal 2: http://localhost:3000 (website) and /login
```

With no SMTP settings, the 6-digit code is printed in terminal 2.

**Development sign-in shortcut:** when `NODE_ENV` is not `production` (i.e. `npm run dev`), the fixed code **`000000`** signs you in as any existing account, so you don't need email set up locally. This is hard-gated in `src/lib/otp.ts` and is completely inert once deployed — on Vercel a real emailed code is always required.

## Settings

Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local` (it is gitignored).

## Deploy to Vercel (via GitHub)

1. **Push this repo to GitHub** (the `origin` remote), then in Vercel choose **Add New → Project → Import** that repo. Vercel detects Next.js automatically. Every later push to the default branch redeploys.
2. **Set the environment variables** in Vercel → Settings → Environment Variables (Production), using `.env.example` as the list:
   - `MONGODB_URI`, `MONGODB_DB` — the real database.
   - `SESSION_SECRET` — a fresh long random string (not the dev one). Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   - `ALLOWED_EMAIL_DOMAIN` — `keystoneinvestmentllc.com`.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — **required**. The `000000` shortcut does not work in production, so without a working mailbox nobody can sign in.
3. **MongoDB Atlas → Network Access:** allow Vercel to connect. Vercel has no fixed IPs, so this usually means `0.0.0.0/0` with a strong database password.
4. **Custom domain:** Settings → Domains → add `keystoneinvestmentllc.com`, then point DNS as Vercel instructs. HTTPS is automatic.

## Compatibility notes

- New documents use exactly the field names the desktop app's C# models use. Some of those models reject unknown fields, so never add extra fields to `users`, project `expenses` or `attachments`. Web-only data, such as login codes, lives in its own `webLoginCodes` collection.
- Money is written in whatever format the existing data uses (string, Decimal128 or double). Dates are stored as Oman midnight in UTC, the same as the desktop app.
- Attachments are limited to 4 MB per claim or expense, because Vercel caps request size at about 4.5 MB. Photos are compressed in the browser before upload.
