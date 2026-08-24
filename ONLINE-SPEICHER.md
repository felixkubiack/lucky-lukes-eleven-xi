# Gemeinsamer Online-Speicher

Diese Version enthält einen echten gemeinsamen API-Speicher unter:

- `GET /api/state`
- `PUT /api/state`
- `GET /api/health`

Der Speicher nutzt Vercel Blob. Damit sehen Admin und Spieler auf verschiedenen Geräten
dieselben Bewerbungen, Mitglieder, Rollen, Mitteilungen, Einheiten, Teilnahmen,
Umfragen und die Aufstellung.

## Variante A – Website + Backend gemeinsam auf Vercel

`config.js` kann unverändert bleiben:

    window.LLX_API_URL = '/api/state';

Einmalig im Vercel-Projekt:
Storage -> Blob -> Store erstellen/verbinden.

Danach neu deployen.

## Variante B – Frontend auf GitHub Pages, Backend auf Vercel

1. Dieses Projekt als Backend auf Vercel veröffentlichen.
2. Die Backend-Adresse nehmen, z. B.:
   https://dein-backend.vercel.app
3. In `config.js` auf GitHub Pages eintragen:

    window.LLX_API_URL = 'https://dein-backend.vercel.app/api/state';

Das Backend erlaubt CORS, damit GitHub Pages darauf zugreifen kann.

## Wichtig

Ohne Benutzerkonten/Authentifizierung ist dies ein Vereins-Prototyp.
Für ein öffentliches Produkt mit sensiblen Daten sollte später Login/Auth ergänzt werden.
