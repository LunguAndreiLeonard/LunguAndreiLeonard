# 📍 No-Website Finder — unealtă de prospectare

Unealta mea personală de lead-gen: găsește **afaceri de pe Google Maps fără website**
în **Canada 🇨🇦 · SUA 🇺🇸 · UK 🇬🇧 · Germania 🇩🇪 · Spania 🇪🇸**, le pune pe hartă, le
**clasează cu AI** și îmi scrie **mesajele de outreach** — ca să vând site-uri firmelor
care n-au.

> **De uz propriu.** Datele Google se folosesc live pentru prospectare, **nu se stochează
> și nu se revând** (vezi ToS Google Maps Platform). Singurul lucru salvat local e
> **statusul lead-urilor** (mini-CRM în browser).

## Funcții

- **Hartă** — Leaflet + OpenStreetMap.
- **Căutare pe server** — Google Places API (New) pe cheia ta; păstrează doar afacerile
  fără `websiteUri`. Opțiune **scanare adâncă** (până la 60/categorie).
- **AI (Claude Opus 4.8)** — din limbaj natural derivă categoriile, **clasează** lead-urile
  (scor 0–100 + motiv) și scrie **mesaje de outreach** personalizate.
- **Mini-CRM** — marchezi fiecare lead: 🆕 Nou / 📨 Contactat / 🔥 Interesat / ✅ Client / 🚫 Nu.
  Salvat în browser. Filtru + **export CSV** (cu status inclus).

## Rulare

Necesită un runtime de funcții serverless (pentru `/api/*`). Cel mai simplu cu Vercel:

```bash
cd no-website-finder
npm install
cp .env.example .env     # pune cheile tale
npx vercel dev           # static + /api pe același port → http://localhost:3000
```

### Chei (`.env`)

| Cheie | Pentru |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (search NL, scoring, outreach) |
| `GOOGLE_PLACES_KEY` | Google Places API (New) — activează „Places API (New)" în Google Cloud |

Ambele stau **pe server**, nu în browser.

## Fluxul meu de lucru

1. Aleg oraș + țară (opțional scriu ce caut, ex: „frizerii și cafenele").
2. **Caută** → apar afacerile fără site pe hartă + listă.
3. **⭐ Scor AI** → le ordonez de la cel mai promițător.
4. La fiecare: **✉ Mesaj AI** → copiez mesajul și îl trimit.
5. Marchez statusul (Contactat → Interesat → Client). **Export CSV** pentru evidență.

## Structură

```
no-website-finder/
├── index.html        # UI + hartă
├── styles.css        # temă dark
├── app.js            # frontend: search → scoring → outreach → mini-CRM
├── data.demo.js      # exemplu fără API
├── package.json      # @anthropic-ai/sdk
├── .env.example      # cheile (server)
└── api/
    ├── _lib.js       # client Claude + Google Places (paginare)
    ├── plan.js       # NL → listă de căutări (multi-oraș, opțional)
    ├── search.js     # Google Places + filtrare fără-site
    ├── score.js      # scoring AI al lead-urilor
    └── outreach.js   # mesaj outreach per lead
```

## Mai târziu (când vrei să faci bani din tool)

Dacă vrei să-l vinzi altor agenții: modelul curat e **SaaS BYO-key** (userul își pune
cheia lui de Google, tu vinzi stratul AI + UI pe abonament). Așa muți costul și
răspunderea ToS pe user. Vezi discuția din istoricul proiectului.
