import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadProfile() {
  const raw = await readFile(path.join(__dirname, "..", "config", "profile.json"), "utf-8");
  return JSON.parse(raw);
}
