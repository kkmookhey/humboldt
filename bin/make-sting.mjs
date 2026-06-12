import { makeStings } from "../lib/brand.mjs";

// Optional: pass a Higgsfield (or any) background clip to sit behind the brand text.
//   node bin/make-sting.mjs [path/to/background.mp4]
const bgVideo = process.argv[2];
const { intro, outro } = await makeStings({ bgVideo });
console.log(`✅ Stings →\n  ${intro}\n  ${outro}`);
