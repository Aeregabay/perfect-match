# Perfect Match

Wedding planner for couples – plan together: venues (checklist, comparison, offers, photos), guests, seating, schedule and tasks.
Android app (Capacitor) and web app from one codebase.

## Features
- **Overview**: people invited vs. capacity, RSVPs, tasks, seating, charts (RSVP, sides, menus, accommodation, save-the-date, invitations), people per day, open points, top 3 venues.
- **Venues**: 50+ checklist questions with ✓ / ? / ! status and notes, own questions, availability calendar for preferred months, curfew sliders, mandatory suppliers, cover photo and up to 8 visit photos, star rating, top 3, archive with reason.
- **Comparison** table with key facts, curfews chart, available dates across venues, open problems.
- **Planning** per venue: 20 services with supplier, net price, VAT, "included", "to clarify", packages, discount, total; offers as PDF or image with built-in viewer.
- **Guests**: invitations with companion and children, side, RSVP, menu, accommodation, contact, allergies, days of attendance, save the date (digital/printed), invitation sent, filters, search, import from Excel/CSV, CSV export.
- **Seating plan** with round and long tables, households placed together.
- **Schedule** per event day with gaps, tags and links to tasks or open questions.
- **Tasks** board (to-do / ongoing / done) with checklists and drag & drop.
- **Together**: partner joins with a one-time code; live updates; simultaneous edits merged; works offline.
- **Sign-in**: Google, Apple or email + password; optional two-factor authentication.

## Stack
| Layer | Choice |
|---|---|
| App | TypeScript, Vite, no UI framework (fast on low-end phones) |
| Android | Capacitor 8 (Keystore secure storage, Custom Tabs for sign-in, share sheet) |
| Backend | Supabase EU (Postgres with row-level security, Auth, Storage, Realtime) |
| Web hosting | Cloudflare Pages (TLS, WAF, Turnstile, security headers) |
| CI/CD | GitHub Actions: typecheck, build, audit, access-rule tests, end-to-end tests, signed Play bundle on tag |

## Structure
```
src/main.ts            start: sign-in → wedding → planner
src/screens/           sign-in, onboarding
src/planner/           planner (views, interaction, mapping to server items)
src/lib/               supabase client, auth, sync & merge, encrypted cache, files, i18n
src/styles/app.css     look (boho pastel, light/dark)
supabase/migrations    schema incl. all access rules, file bucket
supabase/functions     delete-account
supabase/tests         access-rule tests
tests/e2e              end-to-end tests
android/               native Android project
docs/                  setup, security, roadmap
```

## Languages
English text in the code is the source. `npm run i18n:extract` writes all texts to `src/i18n/catalog.json`;
a translation is a copy with values filled in, registered with `registerLanguage()` in `src/main.ts`.
Dates, times, numbers and currencies already follow the device locale.

See `docs/SETUP.md` for the one-time setup and `docs/SECURITY.md` for the data-protection design.
