# MailSnap

Schlichte GitHub-Pages-Web-App zum Erkennen und Kopieren von E-Mail-Adressen aus **eingesetzten** Screenshots oder Fotos.

## Neu in dieser Version

- **Kein Bild-Upload aus der Mediathek mehr** – der Ablauf ist nur noch auf **Einsetzen / Paste** ausgelegt.
- **Keine Bildvorschau** mehr: Das Foto wird nicht angezeigt, nur die erkannte Mail.
- **Kein Reinzoomen**: Die Seite ist auf eine feste mobile Darstellung optimiert.
- **Ergebnis ganz oben** mit sofort sichtbarem Kopierbutton.
- **Automatischer Reset nach dem Kopieren**, damit direkt das nächste Foto eingesetzt werden kann.
- **Neues Icon** mit Mail-/Kamera-Motiv für Favicon und Home-Screen-Vorschau.

## Nutzung

1. Screenshot oder Foto kopieren.
2. In der App auf **„Foto einsetzen“** tippen.
3. Falls dein Browser nicht direkt auf die Zwischenablage zugreifen darf:
   - **iPhone / iPad:** im Einfügebereich lange drücken → **Einsetzen**.
   - **PC / Mac:** **Strg+V** bzw. **⌘V**.
4. Die erkannte E-Mail erscheint oben und lässt sich mit **einem Klick kopieren**.
5. Nach dem Kopieren setzt sich die App automatisch zurück.

## Veröffentlichen auf GitHub Pages

1. Neues **öffentliches Repository** auf GitHub anlegen, z. B. `mailsnap`.
2. Alle Dateien aus diesem Ordner hochladen.
3. In GitHub unter **Settings → Pages**:
   - **Deploy from a branch**
   - Branch: `main`
   - Ordner: `/(root)`
4. Speichern. Danach ist die App unter `https://DEINNAME.github.io/mailsnap/` erreichbar.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – schlichtes Design
- `app.js` – Einfügen, OCR, Mail-Erkennung, Kopieren, Reset
- `manifest.webmanifest` – App-Metadaten
- `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` – Icons

## Hinweis

Die Texterkennung läuft im Browser mit **Tesseract.js**. Beim ersten Laden wird dafür eine Internetverbindung benötigt.
