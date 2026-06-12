# 🔎 SEAP Finder

Aplicație care caută pe [e-licitatie.ro](https://e-licitatie.ro/pub) (SEAP/SICAP) licitații și achiziții publice potrivite pentru **web development & software** — sau orice alt profil îți definești.

Fiecare anunț primește un **scor de potrivire (0-100%)** calculat din cuvintele cheie, codurile CPV și cuvintele de excludere din profilul tău.

## Cum o pornești

Ai nevoie doar de **Node.js 18+** (fără `npm install`, zero dependențe):

```bash
cd seap-finder
npm start        # sau: node server.js
```

Apoi deschide **http://localhost:3000**.

## Ce face

- **📋 Licitații deschise** — anunțurile de participare publicate în ultimele 7-90 de zile, cu termen de depunere, valoare estimată, autoritate contractantă și link direct către anunțul de pe e-licitatie.ro.
- **🛒 Cumpărări directe** — achizițiile din catalogul SEAP (finalizate sau în desfășurare). Cele finalizate îți arată *cine cumpără* servicii web/software și la ce prețuri — utile pentru prospectare.
- **⭐ Salvate** — păstrezi anunțurile interesante în browser (localStorage).
- Căutare liberă, filtru de perioadă și scor minim, badge-uri care arată *de ce* s-a potrivit un anunț.

## Personalizează profilul tău

Editează [`config/profile.json`](config/profile.json):

- `keywords` — termeni + pondere (diacriticele nu contează: „aplicație” = „aplicatie”);
- `cpvPrefixes` — prefixe de coduri CPV relevante (ex. `72` = servicii IT, `48` = pachete software);
- `negativeKeywords` — termeni care penalizează anunțul (hardware, tonere etc.);
- `minScore` — pragul implicit de afișare.

Modificările se aplică la următoarea căutare, fără restart.

## Pune-o pe net (gratuit)

### Vercel (recomandat — îl ai deja în stack)

Proiectul e gata configurat pentru Vercel (funcțiile din `api/` + static din `public/`):

1. Intră pe [vercel.com/new](https://vercel.com/new) și importă repo-ul tău;
2. La **Root Directory** alege `seap-finder`;
3. Framework preset: **Other** — nu e nevoie de build command;
4. Deploy. Gata, primești un URL public de forma `seap-finder.vercel.app`.

### Render (alternativă, rulează `server.js` ca atare)

1. [render.com](https://render.com) → New → **Web Service** → conectează repo-ul;
2. Root Directory: `seap-finder`, Start Command: `node server.js`;
3. Instance type: Free.

> 💡 Dacă pe platforma de hosting primești erori 403/blocked de la SEAP, e posibil ca e-licitatie.ro să filtreze IP-urile de datacenter străine. În acest caz local va merge oricum, iar pentru online încearcă o regiune de deploy din Europa (Render: Frankfurt) sau un VPS european.

## Cum funcționează

Serverul Node interoghează API-ul public folosit chiar de interfața e-licitatie.ro:

- `POST /api-pub/NoticeCommon/GetCANoticeList/` — lista anunțurilor de participare;
- `POST /api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/` — cumpărările directe.

Răspunsurile sunt normalizate defensiv (API-ul nu e documentat oficial și schema mai diferă între versiuni), cache-uite 10 minute și punctate local după profil. Dacă SEAP schimbă numele câmpurilor, ajustează listele de fallback din `lib/sicap.js`.

> ⚠️ API-ul SEAP nu e documentat oficial — folosește aplicația rezonabil (nu seta perioade uriașe în mod repetat), ca să nu pui presiune pe serviciul public.
