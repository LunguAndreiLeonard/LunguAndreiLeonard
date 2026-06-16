# 📍 No-Website Finder

Aplicație web (hartă) care găsește **afaceri de pe Google Maps fără website** în
**Canada 🇨🇦 · SUA 🇺🇸 · Marea Britanie 🇬🇧 · Germania 🇩🇪 · Spania 🇪🇸**.

Ideală ca instrument de lead-gen: cauți o categorie într-un oraș, aplicația
păstrează doar afacerile care **nu au site**, le arată pe hartă + listă și le poți
exporta în CSV pentru outreach.

## Cum funcționează

- **Hartă:** Leaflet + OpenStreetMap (gratis, fără cheie).
- **Date:** [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/op-overview)
  — endpoint `places:searchText`. Pentru fiecare rezultat se verifică câmpul
  `websiteUri`; se păstrează doar cele unde lipsește.
- **Mod demo:** fără cheie API, butonul rulează cu date exemplu ca să vezi fluxul.

## Rulare locală

Fiind static, ai nevoie doar de un server HTTP (din cauza CORS / `fetch`):

```bash
cd no-website-finder
python3 -m http.server 8000
# deschide http://localhost:8000
```

Sau publică folderul pe GitHub Pages / Netlify / Vercel.

## Cheie Google Places API

1. Intră în [Google Cloud Console](https://console.cloud.google.com/) → creează un proiect.
2. Activează **Places API (New)**.
3. Creează o cheie API (Credentials → API key). Recomandat: restricționează cheia
   pe domeniul tău (HTTP referrer) și doar pe Places API.
4. Lipește cheia în aplicație (secțiunea 🔑). Rămâne salvată **doar** în
   `localStorage`-ul browser-ului tău, nu se trimite nicăieri altundeva.

> ⚠️ Google Places API este **plătit** după nivelul gratuit lunar. „Search”
> aprofundat (mai multe pagini) consumă mai multe cereri. Vezi
> [prețurile Places API](https://developers.google.com/maps/billing-and-pricing/pricing).

## Note legale

Folosește datele conform [Termenilor Google Maps Platform](https://cloud.google.com/maps-platform/terms).
Aplicația interoghează la cerere o categorie + zonă (nu descarcă „toate locațiile”
global — Google nu permite asta și ar fi prohibitiv ca volum/cost).

## Structură

```
no-website-finder/
├── index.html      # UI + hartă
├── styles.css      # stiluri (temă dark)
├── app.js          # logica de căutare + filtrare website + export CSV
└── data.demo.js    # date exemplu pentru modul demo
```
