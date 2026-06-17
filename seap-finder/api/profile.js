import { loadProfile } from "../lib/profile.js";

export default async function handler(req, res) {
  res.status(200).json(await loadProfile());
}
