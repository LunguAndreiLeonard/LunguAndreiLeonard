// Server local de dezvoltare (fără dependențe externe).
// Servește fișierele statice + rutează /api/<nume> către handler-ele din /api,
// cu un mic adaptor care adaugă res.status()/res.json() (stil Vercel).
//
//   node server.js            → http://localhost:4000
//   PORT=3000 node server.js  → alt port
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "4000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Adaptor: dă unui res Node metode în stil Vercel/Express.
function decorate(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };
  return res;
}

async function handleApi(req, res, name) {
  decorate(res); // important: și calea de eroare are nevoie de res.status()/res.json()
  const file = join(ROOT, "api", `${name}.js`);
  if (name.startsWith("_") || !existsSync(file)) {
    return res.status(404).json({ error: `Ruta /api/${name} nu există.` });
  }
  try {
    const mod = await import(pathToFileURL(file).href);
    // Adăugăm req.query din URL pentru handlerele care îl folosesc.
    req.query = Object.fromEntries(new URL(req.url, "http://x").searchParams);
    await mod.default(req, res);
  } catch (err) {
    console.error(`/api/${name}:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message.includes("ANTHROPIC_API_KEY") || err.message.includes("apiKey")
          ? "Lipsește ANTHROPIC_API_KEY (sau pachetul nu e instalat). Rulează: npm install + .env"
          : err.message,
      });
    }
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  const body = await readFile(file);
  res.setHeader("Content-Type", MIME[extname(file)] || "application/octet-stream");
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname.startsWith("/api/")) {
    return handleApi(req, res, pathname.slice(5).replace(/\/+$/, ""));
  }
  serveStatic(req, res, pathname).catch(() => { res.statusCode = 500; res.end("error"); });
});

server.listen(PORT, () => {
  console.log(`No-Website Finder → http://localhost:${PORT}`);
  console.log(`(UI + modul "Exemplu" merg fără chei; /api/* are nevoie de .env)`);
});
