# Marquee

PWA personale per film e serie TV: ricerca, filtri (piattaforma, genere, anno, voto, attore), consigli basati sui preferiti e liste (da vedere, visti, preferiti).

- Dati: [TMDB](https://www.themoviedb.org/) (la chiave API si inserisce nell'app, in Impostazioni, e resta nel dispositivo)
- Le liste sono salvate nel browser; export/import JSON per il backup
- Stack: React + Vite + TypeScript + vite-plugin-pwa
- Deploy: GitHub Pages tramite GitHub Actions

```bash
npm install
npm run dev
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
