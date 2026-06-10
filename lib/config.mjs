import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWPORT = { width: 1920, height: 1080 };
export const THEME = {
  mono: "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace",
  accent: "#58a6ff",
  accent2: "#bc8cff",
  ok: "#56d364",
  text: "#c9d1d9",
};

export const outDir = (id) => path.join(ROOT, "out", id);
export const authDir = () => path.join(ROOT, ".auth");

export function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^OPENAI_API_KEY\s*=\s*([^#\n]+)/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("OPENAI_API_KEY not found (set env var or cloud-course-studio/.env)");
}
