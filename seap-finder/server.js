import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTenders, fetchDirectAcquisitions } from "./lib/sicap.js";
import { filterAndRank } from "./lib/score.js";
import { loadProfile } from "./lib/profile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  try {
    if (url.pathname === "/api/profile") {
      return sendJSON(res, 200, await loadProfile());
    }

    if (url.pathname === "/api/tenders") {
      const days = Math.min(parseInt(url.searchParams.get("days") || "30", 10), 90);
      const profile = await loadProfile();
      const items = await fetchTenders(days);
      const results = filterAndRank(items, profile, {
        minScore: url.searchParams.has("minScore")
          ? parseInt(url.searchParams.get("minScore"), 10)
          : undefined,
        query: url.searchParams.get("q") || "",
      });
      return sendJSON(res, 200, { totalFetched: items.length, results });
    }

    if (url.pathname === "/api/direct") {
      const days = Math.min(parseInt(url.searchParams.get("days") || "2", 10), 14);
      const ongoing = url.searchParams.get("ongoing") === "1";
      const profile = await loadProfile();
      const items = await fetchDirectAcquisitions(days, ongoing);
      const results = filterAndRank(items, profile, {
        minScore: url.searchParams.has("minScore")
          ? parseInt(url.searchParams.get("minScore"), 10)
          : undefined,
        query: url.searchParams.get("q") || "",
      });
      return sendJSON(res, 200, { totalFetched: items.length, results });
    }

    // Fișiere statice din public/
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const fullPath = path.join(__dirname, "public", filePath);
    if (!fullPath.startsWith(path.join(__dirname, "public"))) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    try {
      const content = await readFile(fullPath);
      res.writeHead(200, { "Content-Type": MIME[path.extname(fullPath)] || "application/octet-stream" });
      return res.end(content);
    } catch {
      res.writeHead(404);
      return res.end("Not found");
    }
  } catch (err) {
    console.error(err);
    return sendJSON(res, 502, {
      error: "Nu am putut interoga e-licitatie.ro. Încearcă din nou în câteva secunde.",
      detail: String(err.message || err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`SEAP Finder rulează pe http://localhost:${PORT}`);
});
