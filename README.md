# Marquee

PWA personale per scegliere cosa guardare: «Scegli per me» (umore, tempo, compagnia), «Ho voglia di qualcosa come…», «Scegliamo insieme», filtri completi, classifica Il meglio, titoli in scadenza e liste personali.

- Dati: [TMDB](https://www.themoviedb.org/) (la chiave API si inserisce nell'app, in Impostazioni, e resta nel dispositivo)
- Le liste, le reazioni e le preferenze sono salvate nel browser; export/import JSON per il backup
- IA facoltativa (frase libera e schede «Cosa aspettarti» senza spoiler): serve una chiave Anthropic inserita in Impostazioni; le richieste partono dal dispositivo verso Anthropic
- Stack: React + Vite + TypeScript + vite-plugin-pwa
- Deploy: GitHub Pages tramite GitHub Actions

```bash
npm install
npm run dev
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
