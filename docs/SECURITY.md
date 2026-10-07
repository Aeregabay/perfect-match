# Security & data protection

## Data we store
| Data | Purpose | Notes |
|---|---|---|
| Account email, sign-in method | Sign-in | Passwords only as salted hashes inside Supabase Auth; Google/Apple: only email and name |
| Display name | Shown to partner | Optional |
| Wedding details & settings | Planning | Names, date, capacity, currency, event days, options |
| Guests: names, contact, RSVP, menu, accommodation, seats | Guest management | Entered by the couple; the couple is controller, the app is processor |
| Allergies | Catering | Health data (GDPR Art. 9): short free text, hint shown in the form, never used for anything else |
| Venues, answers, prices, tasks, schedule | Planning | |
| Photos and PDFs | Venue visits, offers | Private storage; images are re-encoded on the device, which removes GPS position and camera metadata |

No analytics SDKs, no ads, no third-party fonts or trackers, no data sales.

## Technical measures
- **Hosting in the EU**: Supabase Frankfurt (database, auth, files); Cloudflare edge for the web app.
- **Encryption in transit**: TLS 1.2+ everywhere (HSTS; Android blocks cleartext and user-installed certificate authorities).
- **Encryption at rest**: Supabase encrypts database, files and backups (AES-256). The offline copy on the device is encrypted with AES-256-GCM; on Android the key is kept in the Keystore-backed secure storage, on the web as a non-extractable WebCrypto key.
- **Sign-in**: Google, Apple (OAuth with PKCE, Android via Custom Tabs, never inside the WebView) or email + password. Passwords: at least 10 characters with mixed character types, checked against leaked-password lists; email ownership confirmed with a one-time code; password reset and password change confirmed by email code. Optional **two-factor authentication** (authenticator app, TOTP). Cloudflare Turnstile against automated sign-up/sign-in. Error messages never reveal whether an account exists.
- **Second factor enforced by the database**: for accounts with two-factor authentication, every access rule requires a second-factor session (`aal2`), so a stolen password alone gives no data access – not even through the API.
- **Access control in the database**: row-level security on every table and on the file bucket; a user only reads or writes data of weddings they are a member of. Enforced server-side – a modified app cannot bypass it.
- **Automated tests**: `supabase/tests/rls_assert.sql` (51 checks: isolation between couples, invite codes, limits, files, second factor, deletion) and `tests/e2e` (31 checks of full app flows against the real access rules) run on every change and block the build if a guarantee breaks.
- **Least privilege**: anonymous role has no table access; privileged steps run in `SECURITY DEFINER` functions with empty `search_path`; the service-role key is only used inside the `delete-account` function.
- **Concurrent editing**: every item carries a revision number; simultaneous edits by both partners are merged field by field instead of overwriting each other.
- **Secrets**: partner invite codes are random (50 bits), single-use, expire after 7 days, stored only as SHA-256 hashes.
- **Device**: session in Keystore-backed secure storage; app data excluded from cloud backups and device transfer; WebView debugging off in release; code shrinking; only a temporary export folder is shared with other apps.
- **Web**: strict Content-Security-Policy, no framing, no referrer, permissions policy, WAF + bot protection via Cloudflare.
- **Limits**: field and item size limits in the database, file types restricted to JPEG and PDF (max. 12 MB, PDF signature checked), max. 5 weddings per account, max. 5 open invites, free tier enforced in the database.
- **Supply chain**: exact dependency versions, `npm audit` in CI, no CDN scripts (fonts and PDF viewer are bundled).

## User rights (GDPR / Swiss FADP)
- **Erasure**: Settings → Delete account (plus web deletion page). Weddings planned alone are deleted with all photos and documents; shared weddings stay with the partner. Deleting a guest wipes their data immediately; the empty marker that tells the partner's device about it is removed after 30 days.
- **Access / portability**: Settings → Export all data (JSON) and guest list (CSV).
- **Retention**: weddings inactive 24 months after the wedding date are deleted (scheduled job – before launch; users are warned 30 days ahead).

## Before launch (open)
- Privacy policy, terms, imprint (have them reviewed by a lawyer).
- Data processing agreements with Supabase, Cloudflare, the email provider, Google and Apple (sign-in).
- Official Google/Apple button assets (see SETUP 1).
- Retention job.
- Play Console "Data safety": collected = email, name, guests' contact details/addresses, health info (optional), photos/files; encrypted in transit: yes; deletion request: yes; shared with third parties: no.
