// Vercel Edge Middleware — protejează TOATE rutele (static + api) cu un token.
// Setează variabila de mediu ACCESS_TOKEN în Vercel; dacă lipsește, aplicația e publică.
// Acces: deschide o dată /?token=SECRETUL → primești un cookie și navighezi normal.
// Fără token valid, orice cerere primește 404, ca și cum site-ul n-ar exista.

export const config = { matcher: "/(.*)" };

const COOKIE = "seap_token";

export default function middleware(req) {
  const secret = process.env.ACCESS_TOKEN;
  if (!secret) return; // niciun token configurat → acces liber

  const url = new URL(req.url);
  const cookieToken = (req.headers.get("cookie") || "").match(
    new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)
  )?.[1];

  if (cookieToken === secret) return;

  if (url.searchParams.get("token") === secret) {
    url.searchParams.delete("token");
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + url.search,
        "Set-Cookie": `${COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
      },
    });
  }

  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
