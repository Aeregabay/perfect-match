# Testumgebung

Die Test-App heisst «PM Test» (`app.perfectmatch.planner.test`) und läuft neben einer späteren Store-App. Sie spricht ausschliesslich mit einem eigenen Supabase-Testprojekt. Testdaten kommen so nie in die Produktion.

## 1. Supabase-Testprojekt (einmalig, ca. 10 Min.)
1. Neues Projekt `perfect-match-test`, **Region Frankfurt (eu-central-1)**, Free Plan.
2. SQL Editor → nacheinander den Inhalt dieser Dateien ausführen:
   [`0001_init.sql`](../supabase/migrations/0001_init.sql), [`0002_realtime.sql`](../supabase/migrations/0002_realtime.sql), [`0003_storage.sql`](../supabase/migrations/0003_storage.sql).
3. Authentication → Sign In / Providers → **Email**: aktiv, *Confirm email* an, *Secure password change* an, Mindestlänge 10, Klein-/Grossbuchstaben + Ziffern, **Email OTP length 6** (Supabase-Standard ist neu 8, die App erwartet 6), OTP expiration 900 s. **Multi-Factor → TOTP**: Enabled (Standard).
4. Mailvorlagen lassen sich erst mit eigenem SMTP anpassen. Im Testprojekt kommen deshalb Links statt Codes; Testkonten daher wie unter 5 von Hand anlegen.
5. Testkonten: Der eingebaute Mailversand von Supabase stellt nur an Adressen von Mitgliedern deiner Supabase-Organisation zu. Für weitere Testkonten: Authentication → Users → *Add user* → *Create new user*, mit **Auto Confirm User**. Danach meldest du dich in der App mit E-Mail und Passwort an. Für den Partner-Test legst du zwei Konten an.
6. Project Settings → API Keys: **Project URL** und **Publishable key** (`sb_publishable_…`) kopieren.

In der Testumgebung fehlen: Google/Apple-Login, Turnstile, «Konto löschen» (die Edge Function ist nicht deployt) und eigenes SMTP.

## 2. GitHub
Repo → Settings → Secrets and variables → Actions → *New repository secret*:
- `TEST_SUPABASE_URL`: Project URL
- `TEST_SUPABASE_ANON_KEY`: Publishable key

Danach Actions → *Android test build* → *Run workflow*. Jeder Push auf `main` baut die App ebenfalls neu.

## 3. App installieren
Die aktuelle APK liegt immer unter **Releases → test-latest** (`perfect-match-test.apk`).
- **Emulator**: Android Studio → Device Manager → *Create Virtual Device* (z. B. Pixel 8, Android 15, Image mit Google Play) → starten → APK ins Emulatorfenster ziehen.
- **Eigenes Android-Telefon**: Release-Seite auf dem Telefon öffnen → APK laden → Installation aus dieser Quelle erlauben.

Signatur: Test-Builds sind mit dem festen Testschlüssel `android/app/test-signing.jks` signiert, neue APKs installieren sich deshalb als Update über die alte Version. Der Schlüssel liegt bewusst im Repo, er gilt nur für die Test-App, nie für den Store.

Debugging: In der Test-App ist WebView-Debugging aktiv. Mit Chrome auf dem PC öffnest du `chrome://inspect` und siehst Konsole und Netzwerk.

Hinweis: Das Repo ist öffentlich. Das gilt damit auch für die Test-APK und den darin enthaltenen anon key. Der anon key ist von Supabase als öffentlich vorgesehen und durch RLS geschützt. Mit der APK kann sich aber jeder im Testprojekt registrieren, sofern er einen Bestätigungscode erhält.
