# MailSnap 📋

Eine kleine, kostenlose Web-App für **GitHub Pages**, die E-Mail-Adressen aus Fotos und Screenshots liest und mit einem Klick kopiert.

## Funktionen

- Screenshot per **Strg+V / ⌘V**, Einfüge-Button, Drag & Drop oder Datei-Auswahl verwenden.
- Auf dem iPhone in der App im Eingabefeld **lange drücken → Einsetzen** (alternativ Foto auswählen).
- Die Texterkennung startet **automatisch** nach dem Einfügen.
- Erkennt auch E-Mail-Adressen, deren Domain **auf zwei Zeilen umbricht**.
- Ergebnis wird als **bearbeitbarer Text** angezeigt. Das **Ergebnis erscheint ganz oben** und die Ergebnisleiste bleibt **beim Scrollen oben sichtbar**, sodass der Kopieren-Button ohne Zurückscrollen erreichbar ist.
- Bei schwierigen Handyfotos mit **Bereich markieren** nur die Adresse auswählen.
- Alles läuft im Browser. Die Fotos werden nicht auf einen eigenen Server hochgeladen.

## So veröffentlichst du die App auf GitHub (kostenlos)

1. Bei [github.com/new](https://github.com/new) ein **öffentliches Repository** anlegen, zum Beispiel `mailsnap`.
2. `index.html`, `styles.css` und `app.js` in das Repository hochladen (unter **Add file → Upload files**) und speichern.
3. Auf GitHub **Settings → Pages** öffnen.
4. Unter **Build and deployment → Source** die Option **Deploy from a branch** wählen. Branch `main`, Ordner `/(root)` wählen und **Save** drücken.
5. Die App ist anschließend unter `https://DEIN-NAME.github.io/mailsnap/` erreichbar. GitHub zeigt den genauen Link unter **Settings → Pages** an.

**Wichtig:** Eine ZIP-Datei nicht einfach als eine einzige Datei hochladen. Erst entpacken und die enthaltenen Dateien hochladen.

## Technik / Datenschutz

- Statische Website: HTML, CSS, JavaScript – kein Backend, keine API-Keys.
- Texterkennung durch [Tesseract.js](https://github.com/naptha/tesseract.js), aktuell über ein externes CDN eingebunden.
- Für den ersten Start benötigt die App Internet zum Laden der OCR-Bibliothek und Sprachdaten. Die Erkennung läuft dann auf dem Gerät.
- Bilder und erkannte Adressen werden von dieser App nicht gespeichert und nicht an einen eigenen Server gesendet.
- Die OCR kann Zeichen verwechseln; erkannte Adressen vor Benutzung kurz prüfen.
- Die Clipboard-Berechtigungen unterscheiden sich je nach Browser; wenn Einfügen blockiert ist, **Bild auswählen** benutzen.

## Dateien

```text
mailsnap/
├── index.html  # Oberfläche
├── styles.css  # Design
├── app.js      # Einfügen, OCR, E-Mail-Erkennung, Kopieren
└── README.md   # Anleitung
```
