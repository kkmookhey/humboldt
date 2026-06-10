import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { validateModule } from "./schema.mjs";

export function loadModule(id) {
  if (!id) throw new Error("usage: provide a module id (file under modules/)");
  const file = path.join(ROOT, "modules", `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`module not found: ${file}`);
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  validateModule(m);
  return m;
}
