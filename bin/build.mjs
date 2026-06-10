import { loadModule } from "../lib/module.mjs";
import { generateAudio } from "../lib/tts.mjs";
import { recordModule } from "../lib/recorder.mjs";
import { muxModule } from "../lib/mux.mjs";

const m = loadModule(process.argv[2]);
console.log(`Building module: ${m.id}\n`);
const manifest = await generateAudio(m);
await recordModule(m, manifest);
muxModule(m);
