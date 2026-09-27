# Vita

Ernährung und Training für Tami und Cristian. Eine Web-App, die sich wie eine normale App auf dem Handy installieren lässt.

- **Design:** die Screens aus dem Claude-Design-Prototyp, unverändert (`screens/`)
- **Technik:** `vita-runtime.js` lässt die Screens als App laufen und speichert alles gemeinsam in Supabase
- **KI:** Supabase-Funktion `ai` (`supabase/functions/ai/index.ts`), fragt Claude nach Nährwerten
- **Datenbank einrichten:** `supabase/setup.sql`
- **Zugangsdaten:** `config.js` (Supabase-URL und öffentlicher Schlüssel; ohne Haushalts-Login kommt niemand an die Daten)

Auf dem Handy installieren:
- iPhone (Safari): Teilen → „Zum Home-Bildschirm"
- Android (Chrome): Menü ⋮ → „App installieren"
