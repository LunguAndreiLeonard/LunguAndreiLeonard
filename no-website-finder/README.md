# 📍 No-Website Finder — €5/oraș

Aplicație web (hartă) care găsește **afaceri de pe Google Maps fără website** în
**Canada 🇨🇦 · SUA 🇺🇸 · Marea Britanie 🇬🇧 · Germania 🇩🇪 · Spania 🇪🇸**, cu **AI** și
monetizare **€5/oraș** prin Stripe.

Instrument de lead-gen pentru o agenție web: utilizatorul alege un oraș, plătește
€5, iar aplicația returnează afacerile fără site — cu **scoring AI** și **mesaje de
outreach** generate de Claude.

## Funcții

- **Hartă** — Leaflet + OpenStreetMap (gratis).
- **Căutare pe server** — Google Places API (New) rulează pe **cheia ta**, pe backend;
  filtrează afacerile fără `websiteUri`. Adâncime limitată (`MAX_CATEGORIES`) ca să
  ții costul Google mult sub €5.
- **AI (Claude Opus 4.8)** — din limbaj natural derivă categoriile, **clasează** lead-urile
  (scor 0–100 + motiv) și scrie **mesaje de outreach** personalizate.
- **Plăți** — Stripe Checkout, €5/oraș. Acces deblocat printr-un **credit semnat (HMAC)** per oraș.

## Arhitectură

```
Browser (static)                    Server (/api/* — serverless)
─────────────────                   ────────────────────────────
index.html / app.js   ──►  /api/checkout   → Stripe Checkout (€5)
                      ◄──  redirect ?session_id
                      ──►  /api/credit      → verifică plata, emite credit semnat
                      ──►  /api/search      → Google Places (cheia ta) + filtrare fără-site   [necesită credit]
                      ──►  /api/score       → Claude clasează lead-urile
                      ──►  /api/outreach    → Claude scrie mesajul
                           /api/webhook     → confirmare plată (plasă de siguranță)
```

**Cheile (Claude, Google, Stripe) stau DOAR pe server.** Browserul nu vede niciuna.

## Rulare

Necesită un runtime de funcții serverless. Cel mai simplu cu Vercel:

```bash
cd no-website-finder
npm install
cp .env.example .env     # completează cheile
npx vercel dev           # rulează static + /api pe același port
```

Sau publică pe Vercel/Netlify și setează variabilele de mediu din `.env.example`.

### Variabile de mediu (`.env.example`)

| Cheie | Pentru |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (search NL, scoring, outreach) |
| `GOOGLE_PLACES_KEY` | Google Places API (New) — activează „Places API (New)" în Google Cloud |
| `STRIPE_SECRET_KEY` | Stripe (plăți) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook (`whsec_…`) — opțional pentru schelet |
| `CREDIT_SECRET` | secret random pentru semnarea creditelor (`openssl rand -hex 32`) |
| `PRICE_EUR_CENTS` | preț/oraș în cenți (default `500` = €5) |

> Stripe: pentru webhook local rulează `stripe listen --forward-to localhost:3000/api/webhook`.

## ⚠️ TODO înainte de producție

Acesta este un **schelet funcțional**. Pentru lansare reală:

1. **Anti-reutilizare credit** — acum creditul semnat e valabil 24h pentru un oraș.
   Adaugă un store (KV/DB) care marchează `session_id`/credit drept consumat (în
   `api/webhook.js` și `api/search.js`), ca un credit să nu fie folosit la nesfârșit.
2. **ToS Google** — Maps Platform restricționează stocarea/revânzarea datelor Places.
   Aplicația **generează la cerere și NU stochează** — păstrează așa și citește termenii.
3. **Marjă** — `MAX_CATEGORIES` ține costul Google sub €5. Verifică prețurile Places
   înainte de a mări adâncimea scanării.
4. **Limitare/abuz** — adaugă rate-limiting pe `/api/*`.

## Structură

```
no-website-finder/
├── index.html        # UI + hartă
├── styles.css        # temă dark
├── app.js            # frontend: flux plată → search → scoring → outreach
├── data.demo.js      # exemplu gratis (preview)
├── package.json      # @anthropic-ai/sdk, stripe
├── .env.example      # cheile (server)
└── api/
    ├── _lib.js       # client Claude, Google Places, credite semnate (HMAC)
    ├── plan.js       # NL → listă de căutări (multi-oraș)
    ├── search.js     # Google Places + filtrare fără-site  [necesită credit]
    ├── score.js      # scoring AI al lead-urilor
    ├── outreach.js   # mesaj outreach per lead
    ├── checkout.js   # Stripe Checkout (€5/oraș)
    ├── credit.js     # session_id plătit → credit semnat
    └── webhook.js    # webhook Stripe (confirmare plată)
```
