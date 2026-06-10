import { loadModule } from "../lib/module.mjs";
import { redactModule } from "../lib/redact.mjs";

redactModule(loadModule(process.argv[2]));
