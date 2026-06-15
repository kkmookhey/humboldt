import { loadModule } from "../lib/module.mjs";
import { musicModule } from "../lib/music.mjs";

musicModule(loadModule(process.argv[2]));
