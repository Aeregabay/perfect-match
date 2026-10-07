# Perfect Match – Übergabe (Stand 07.10.2026, Version 0.2.2)

## Feste Vorgaben des Owners
- App-Name **«Perfect Match»**, Package `app.perfectmatch.planner`. Kein Personenname des Owners darf im Code, in Texten, Domains, Commits oder Store-Einträgen erscheinen; die App ist von ihm losgekoppelt. Commit-Autor: «Perfect Match <dev@perfectmatch.invalid>».
- DSGVO: immer State of the Art – EU-Hosting, RLS, Verschlüsselung, Cloudflare-Schutz.
- App-Sprache vorerst Englisch; später DE, FR, IT, ES, RU, NL, EL, SR u. a.
- Einmalkauf statt Abo (Freemium: gratis 30 Personen, 2 Locations, 40 Dateien; Freischaltung per Google Play Billing – noch nicht gebaut).
- Privates Google-Play-Entwicklerkonto; der Owner stellt die 12+ Tester für den 14-tägigen Closed Test selbst.
- Konten/Konfiguration (Supabase, Cloudflare, Google, Apple, Play) macht der Owner selbst – Anleitung in `docs/SETUP.md`.
- Login: Google, Apple oder E-Mail + Passwort (E-Mail allein reicht nicht), optional 2FA (TOTP).
- Funktionen und Look 1:1 wie das Planer-Artefakt des Owners (https://claude.ai/artifact/RUSuYMPLmCyq1qTJEiE3Kb), ausser was generalisiert werden muss. Der Planer bleibt separat; Änderungen am Planer werden auf Wunsch portiert («übernehme die letzte Änderung»): Live-Artefakt lesen, Code ohne eingebettete Daten extrahieren, gegen den zuletzt portierten Stand diffen, übertragen, testen. Zuletzt portiert: Planer-Version mit Save-the-Date-Rückmeldung (07.10.2026, 18:31).
- Bewusste Abweichungen vom Planer (beim Portieren erhalten): Ablauf-Tage als horizontaler Zeitstrahl (`.ag-tl`), Datums-Locale = App-Sprache + Geräteregion, Safe-Area-Handling für Android.
- Bewusst nicht portiert: Sitzplan-Export für die private Hochzeitswebsite, Beispiel-Locations, länderspezifische Inhalte.

## Architektur
- Frontend: TypeScript + Vite, kein Framework; Planer-Code portiert in `src/planner/*`, Look in `src/styles/app.css` (Fonts gebündelt via @fontsource).
- Android: Capacitor 8 (Secure Storage im Keystore, Custom Tabs für OAuth mit Scheme `app.perfectmatch.planner://login-callback`, Share/Filesystem für Downloads, Backups aus, Cleartext aus).
- Backend: Supabase EU (Frankfurt). Tabellen: profiles, weddings (inkl. settings jsonb), wedding_members, wedding_invites (Codes nur als SHA-256), entities (pro Eintrag: loc/guest/task/agenda/table/cfg mit rev, Tombstones). `put_entity` mit Revision; Konflikte werden im Client feldweise gemerged (`src/lib/util.ts` merge3). RLS überall, `aal_ok()` erzwingt 2FA-Sitzung für Konten mit 2FA. Free-Limits per Trigger. Storage-Bucket `wedding-files` (privat, JPEG/PDF, Pfad `<wedding>/<ph|vp|pf>/<id>.ext`, Quota per Policy). Edge Function `delete-account` (löscht auch Dateien).
- Sync: `src/lib/sync.ts` (Diff gegen Serverstand, Outbox, Realtime + Polling-Fallback), verschlüsselter Offline-Cache (AES-GCM) in `src/lib/securecache.ts`.
- Undo/Redo (10 Schritte, eintragsweise, Partner-Änderungen bleiben): `src/planner/history.ts`.
- Einstellungen pro Hochzeit: Namen, Datum, Kapazität, Währung, Standard-MwSt, Website-Link, Event-Tage, Wunschmonate, Sperrzeiten, Menüs, Unterkünfte, Partner-Code, 2FA, Export JSON/CSV, Konto löschen.
- CI: `.github/workflows/ci.yml` (typecheck, build, audit, 51 SQL-Sicherheitstests, E2E mit Postgres + PostgREST + Gateway-Stand-in + Playwright), `android.yml` (signiertes AAB bei Tag `v*`), `web.yml` (Cloudflare Pages), `android-test.yml` (Test-APK «PM Test» gegen das Supabase-Testprojekt, Release `test-latest`; siehe `docs/TESTING.md`).
- i18n: englischer Quelltext in t()/tp(); `npm run i18n:extract` → `src/i18n/catalog.json`.

## Teststand
- 51 SQL-Sicherheitstests grün; Mutationstest: kaputte Regeln werden erkannt.
- E2E grün (Registrierung, Locations inkl. Fotos/PDF, Planung mit MwSt/Rabatt, Gäste inkl. StD-Rückmeldung, Import mit Limit, Sitzplan, Ablauf, Aufgaben, Undo/Redo, Mobile-Tab-Leiste, Partner-Beitritt, Merge, Fremde ohne Zugriff, Offline, Konto löschen).
- Android-Build nur in GitHub Actions (Runner-SDK, `setup-android` ist defekt). Test-APK baut grün.
- Testumgebung (07.10.2026): Supabase-Projekt `perfect-match-test` (Frankfurt, Ref `bytdsduhzyrfekxlhdnl`), Migrationen eingespielt, Email-OTP 6-stellig, TOTP an. Secrets `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` (Publishable Key) gesetzt. APK: Release `test-latest`.

## Offen
1. Produktions-Secrets laut SETUP Abschnitt 2 und signierter Android-Build (Tag `v0.2.2`). CI läuft bereits grün.
2. Google Play Billing (Einmalkauf) mit serverseitiger Prüfung (Edge Function setzt `premium`).
3. Offizielle Google/Apple-Button-Grafiken.
4. Rechtstexte (Datenschutz, AGB, Impressum) + AVVs (Supabase, Cloudflare, Mail-Provider, Google, Apple).
5. Retention-Job (inaktive Hochzeiten 24 Monate nach Datum).
6. Übersetzungen, später iOS.

## Arbeitsweise mit dem Owner
- Deutsch (Schweizer Schreibweise), direkt, kurz; metrische Einheiten; vollständige native Lösungen.
- Bei Änderungen nie eingegebene Daten verlieren.
