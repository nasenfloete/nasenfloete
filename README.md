# Hör genau! 👂

Eine kleine Web-App (PWA) für Kinder: Das Kind hört ein Wort und entscheidet,
ob es **richtig** 👍 oder **falsch** 👎 ausgesprochen wurde.

Gedacht zum gezielten Üben von Lauten, die ein Kind verwechselt. Es ist
immer dasselbe Wort (mit Bild), nur die Aussprache unterscheidet sich:

| Laut | wird zu | Beispiel |
| --- | --- | --- |
| Ü | I | Tür → „Tir“ |
| Ä | E | Käse → „Kese“ (nur langes Ä – kurzes Ä klingt ohnehin wie E) |
| Ö | E | Löwe → „Lewe“ |
| Sch | S | Fisch → „Fiss“ |

Die App ist für Kinder gemacht, die **noch nicht lesen** können: Alles läuft
über Bilder, Töne und Sprache. Text wird im Spiel standardmäßig nicht angezeigt.

## Schwierigkeitsstufen

- ⭐ **Wörter** – „Tür“ / „Tir“
- ⭐⭐ **Kurze Sätze** – „Mach die Tür zu.“ / „Mach die Tir zu.“
- ⭐⭐⭐ **Lange Sätze** – zwei Wörter mit dem Laut, nur eins wird falsch gesagt:
  „Der Schlüssel steckt in der Tür.“ / „Der Schlissel steckt in der Tür.“

Für jeden Laut und jede Stufe gibt es fertige Listen (insgesamt über 100 Wörter
und Sätze, siehe `content.js`). Eigene Wörter und Sätze kann man zusätzlich
anlegen.

## So funktioniert's

1. **Elternbereich öffnen:** unten rechts ⚙️ **1,5 Sekunden gedrückt halten**
   (damit das Kind nicht versehentlich hineinkommt).
2. **Aufnehmen:** Einen Eintrag antippen oder bei einer Stufe
   **„Alle aufnehmen“** wählen – dann geht die App der Reihe nach durch die
   Liste: erst richtig, dann falsch sprechen; was man sagen soll, steht jeweils
   dabei. Einträge lassen sich überspringen. Statt aufzunehmen kann man auch
   eine Audiodatei wählen.
3. **Spielen:** Auf dem Startbildschirm Laut (🚪 Ü, 🐻 Ä, 🦁 Ö, 🐟 Sch) und
   Stufe (⭐ / ⭐⭐ / ⭐⭐⭐) wählen. Das Wort wird vorgespielt, danach sind
   👍 / 👎 freigeschaltet. Tippen auf das Bild spielt es nochmal ab.
   Bei einem Fehler wird die richtige Aussprache vorgespielt.
4. **Lob & Trost:** Eine Vorlesestimme lobt („Super!“) und tröstet („Hör
   nochmal genau hin.“). Schöner ist es mit eigenen aufgenommenen Sprüchen –
   dann werden diese statt der Stimme verwendet.
5. **Fortschritt:** Im Elternbereich steht pro Laut, wie oft die falsche und
   die richtige Aussprache erkannt wurde, der Erfolg pro Stufe und welche
   Wörter noch schwerfallen.

**Tipp:** Richtige und falsche Version möglichst gleich sprechen (Betonung,
Lautstärke, Tempo) – dann kann sich das Kind nur am Laut orientieren.

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
| `content.js` | Fertige Wörter und Sätze pro Laut und Stufe |
| `app.js` | Spiellogik, Aufnahme, Elternbereich, Export/Import |
| `db.js` | IndexedDB-Speicher für Wörter und Aufnahmen |
| `style.css` | Kindgerechtes Design |
| `sw.js` | Service Worker für Offline-Betrieb |
| `manifest.webmanifest`, `icons/` | PWA-Manifest und App-Icons |
