import fs from "node:fs";
import path from "node:path";
import { loadModule } from "../lib/module.mjs";
import { outDir } from "../lib/config.mjs";
import { recordModule } from "../lib/recorder.mjs";

const m = loadModule(process.argv[2]);
const manifestPath = path.join(outDir(m.id), "audio", "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error(`Run gen-audio first: node bin/gen-audio.mjs ${m.id}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
await recordModule(m, manifest);
