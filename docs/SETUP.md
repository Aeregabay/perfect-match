# One-time setup

## 1. Supabase (database, sign-in, files)
1. Create a project, **region: Frankfurt (eu-central-1)**. Strong database password, stored in a password manager.
2. SQL editor → run, in this order: `supabase/migrations/0001_init.sql`, `0002_realtime.sql`, `0003_storage.sql`.
3. Authentication → Sign In / Providers:
   - **Email**: enabled, **Confirm email: on**, **Secure email change: on**, **Secure password change: on**, OTP length 6, OTP expiry 900 s.
   - **Password policy**: minimum length 10, require lowercase + uppercase + digits. Enable **Leaked password protection** (HaveIBeenPwned check; Pro plan).
   - **Google** and **Apple**: see sections 1a and 1b.
   - **Multi-factor**: enable **TOTP (App Authenticator)**.
   - Disable anonymous sign-ins and phone sign-in.
4. Authentication → URL configuration:
   - Site URL: `https://<your-app-domain>`
   - Redirect URLs: `https://<your-app-domain>/` and `app.perfectmatch.planner://login-callback`
5. Authentication → Email templates. The app works with **codes**, not links (no deep links needed, works on any device):
   - *Confirm signup*: `Your Perfect Match code: {{ .Token }}` (remove the link)
   - *Reset password*: `Your code to set a new password: {{ .Token }}`
   - *Reauthentication*: `Your security code: {{ .Token }}`
   - *Change email address*: keep the link or show `{{ .Token }}`.
6. Authentication → SMTP: your own sender (Postmark, Brevo or Amazon SES in an EU region) with a neutral sender address such as `hello@<your-app-domain>`. The built-in sender is rate-limited and not for production.
7. Authentication → Attack protection: enable **CAPTCHA → Cloudflare Turnstile** with the secret key from section 3; keep rate limits at default or lower.
8. Edge Functions → deploy `delete-account` (`supabase functions deploy delete-account`), secret `ALLOWED_ORIGINS=https://<your-app-domain>,https://localhost`.
9. Database → Extensions: enable `pg_cron`, then in the SQL editor:
   `select cron.schedule('purge-tombstones', '17 3 * * *', 'select public.purge_tombstones()');`
10. Database → Backups: enable Point-in-Time Recovery when going live (paid plan).
11. Copy **Project URL** and **anon public key**. The `service_role` key never leaves Supabase.

### 1a. Google sign-in
1. Google Cloud Console → new project (neutral name) → *Google Auth Platform*: app name "Perfect Match", support email = your neutral app address, authorised domain = your app domain and `supabase.co`.
2. Clients → **Web application**: authorised redirect URI = `https://<project>.supabase.co/auth/v1/callback`.
3. Paste client ID and secret into Supabase → Providers → Google.
4. Data access: only `openid`, `email`, `profile` (no verification needed for these).

### 1b. Apple sign-in
Needs an Apple Developer account (99 USD/year), also for Android/web sign-in.
1. Certificates, IDs & Profiles → Identifiers → **Services ID** (e.g. `app.perfectmatch.signin`), enable *Sign in with Apple*, domain `<project>.supabase.co`, return URL `https://<project>.supabase.co/auth/v1/callback`.
2. Keys → new key with *Sign in with Apple* → download the `.p8`.
3. Supabase → Providers → Apple: Services ID, Team ID, Key ID, `.p8` → Supabase generates the client secret. **The secret expires after 6 months** – put a reminder in your calendar.
4. Apple may hide the email (relay address); that works normally.

**Button design**: Google and Apple require their official sign-in button style for production. Download the official assets (Google *Sign in with Google branding guidelines*, Apple *Sign in with Apple HIG*) and add the logos to the two buttons in `src/screens/auth.ts`.

## 2. GitHub
Private repo. Settings → Environments → `production` with these secrets:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`, `TURNSTILE_SITE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Branch protection on `main`: require the CI checks (app, database-security, end-to-end).

## 3. Cloudflare
1. Register a neutral app domain (no personal names), add it to Cloudflare.
2. Pages → project `perfect-match` (the `web.yml` workflow deploys).
3. SSL/TLS: Full (strict), HSTS on, minimum TLS 1.2. Security → WAF managed rules on, Bot Fight Mode on.
4. Turnstile → create a widget (mode *Managed*), hostnames: your app domain **and `localhost`** (the Android app runs on `https://localhost`). Site key → GitHub secret `TURNSTILE_SITE_KEY`, secret key → Supabase (1.7).
5. Host the legal pages on this domain: `/privacy`, `/terms`, `/imprint`, `/delete-account`.
6. If you use a custom Supabase domain, add it to `connect-src` in `public/_headers`.

## 4. Android signing
```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 upload.jks   # → ANDROID_KEYSTORE_BASE64
```
Keep `upload.jks` offline in a safe place. In Play Console, enrol in **Play App Signing** (Google holds the app signing key; this file is only the upload key).

## 5. Google Play
1. Developer account (personal). Use a neutral developer name, not your own name; check which address Google displays publicly for monetised apps and use a business/PO address if needed.
2. Create app "Perfect Match", package `app.perfectmatch.planner` (fixed forever after the first upload).
3. Push a tag `v0.2.0` → the Android workflow produces the `.aab` → **Internal testing**, then **Closed testing** (12+ testers for 14 days for new personal accounts) → Production.
4. Store listing needs: privacy policy URL, account-deletion URL, Data safety form (see `SECURITY.md`), content rating, target audience 18+.

## Local development
```bash
npm ci
cp .env.example .env.local   # Supabase URL + anon key
npm run dev
```
Tests:
```bash
# access rules (needs Postgres 16)
psql -f supabase/tests/supabase_shim.sql $(printf -- '-f %s ' supabase/migrations/*.sql) -f supabase/tests/rls_assert.sql
# end to end (Postgres + PostgREST binary + Playwright)
POSTGREST_BIN=/path/to/postgrest tests/e2e/run.sh
```
