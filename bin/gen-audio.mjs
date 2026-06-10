import { loadModule } from "../lib/module.mjs";
import { generateAudio } from "../lib/tts.mjs";

const m = loadModule(process.argv[2]);
console.log(`Voice: ${m.voice}  Model: ${m.model}\n`);
await generateAudio(m);
