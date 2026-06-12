import { loadModule } from "../lib/module.mjs";
import { brandModule } from "../lib/brand.mjs";

brandModule(loadModule(process.argv[2]));
