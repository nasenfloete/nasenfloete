# Hör genau! 👂

Eine kleine Web-App (PWA) für Kinder: Das Kind hört ein Wort und entscheidet,
ob es **richtig** 👍 oder **falsch** 👎 ausgesprochen wurde.

Gedacht zum gezielten Üben von Lauten, die ein Kind verwechselt – z. B.
**Ü ↔ I** („Tür“ / „Tir“) oder **Sch ↔ S** („Fisch“ / „Fiss“). Es ist immer
dasselbe Wort (mit Bild), nur die Aussprache unterscheidet sich.

Die Wörter nehmen die Eltern direkt in der App auf – einmal richtig
(„Schokolade“) und ein- oder mehrmals falsch („Sokolade“).

## So funktioniert's

1. **Elternbereich öffnen:** unten rechts ⚙️ **1,5 Sekunden gedrückt halten**
   (damit das Kind nicht versehentlich hineinkommt).
2. **Wort anlegen** – selbst oder per Tipp auf einen **Vorschlag** (fertige
   Listen für Ü und Sch mit Bild und falscher Variante). Pro Wort gibt es
   einen **Laut** (z. B. „ü“, „sch“ – frei wählbar) und optional, wie es falsch
   klingt. Danach gleich die richtige und die falsche Aussprache aufnehmen;
   die App zeigt dabei an, was man sagen soll („Sag absichtlich „Tir““).
   Statt aufzunehmen kann man auch eine Audiodatei wählen.
3. Optional: eigene **Lob-** („Super gemacht!“) und **Trost-Sprüche**
   („Hör nochmal genau hin!“) aufnehmen.
4. **Spielen:** Das Wort wird vorgespielt, danach werden die Antwort-Knöpfe
   freigeschaltet. Tippen auf das Bild spielt das Wort nochmal ab.
   Bei einem Fehler wird zum Lernen die richtige Aussprache vorgespielt.
   Gibt es mehrere Laute, kann man auf dem Startbildschirm wählen, welcher
   geübt wird (Alle / Ü / Sch).
5. **Fortschritt:** Im Elternbereich steht pro Laut, wie oft die falsche und
   die richtige Aussprache erkannt wurde, und welche Wörter noch schwerfallen.

Alle Aufnahmen bleiben **nur auf dem Gerät** (IndexedDB) – nichts wird
hochgeladen. Über *Sicherung → Exportieren/Importieren* lassen sie sich als
Datei sichern oder auf ein anderes Handy übertragen.

## Auf dem Handy installieren

Die App muss über **HTTPS** erreichbar sein (sonst gibt es weder Mikrofon
noch Installation). Am einfachsten über GitHub Pages:

1. Im Repo unter *Settings → Pages* als Quelle **GitHub Actions** wählen.
2. Nach `main` mergen – der Workflow `.github/workflows/pages.yml`
   veröffentlicht die App automatisch.
3. Die Seite auf dem Handy öffnen und
   - **iPhone (Safari):** Teilen → *Zum Home-Bildschirm*
   - **Android (Chrome):** Menü ⋮ → *App installieren*

Danach funktioniert die App auch offline.

## Lokal entwickeln

Keine Abhängigkeiten, kein Build. Einfach einen statischen Server starten:

```sh
npx http-server -c-1 .
```

`localhost` gilt als sicherer Ursprung, dort funktioniert auch das Mikrofon.
Nach Änderungen an Dateien in `sw.js` die `VERSION` erhöhen, damit
installierte Apps das Update übernehmen.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Alle Bildschirme (Start, Spiel, Ergebnis, Eltern, Aufnahme-Dialog) |
| `app.js` | Spiellogik, Aufnahme, Elternbereich, Export/Import |
| `db.js` | IndexedDB-Speicher für Wörter und Aufnahmen |
| `style.css` | Kindgerechtes Design |
| `sw.js` | Service Worker für Offline-Betrieb |
| `manifest.webmanifest`, `icons/` | PWA-Manifest und App-Icons |
