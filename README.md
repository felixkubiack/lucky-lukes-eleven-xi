# Lucky Luke's Eleven XI

Kostenlose statische Vereinswebsite für GitHub Pages.

- Spieler: `index.html`
- Admin/VM: `admin.html`
- Responsive / PWA
- Bewerbungen, Rollen, Einheiten, Teilnahmen, Aufstellung, Umfragen, Mitteilungen, Verlauf, Profil und Community

## Speicher
Ohne Backend nutzt die Seite denselben lokalen Browser-Speicher. Das funktioniert zuverlässig auf einem Gerät/Browser und zwischen Tabs.
Für echte Synchronisierung zwischen verschiedenen Handys kann später ein gemeinsamer API-Endpunkt über `window.LLX_API_URL` eingebunden werden, ohne die Oberfläche neu zu bauen.

## GitHub Pages
Repository → Settings → Pages → Deploy from a branch → `main` / `(root)`.


## Gemeinsamer Online-Speicher
Siehe `ONLINE-SPEICHER.md`. Die Website kann jetzt über `/api/state` geräteübergreifend synchronisieren.
