import { loadModule } from "../lib/module.mjs";
import { muxModule } from "../lib/mux.mjs";

muxModule(loadModule(process.argv[2]));
