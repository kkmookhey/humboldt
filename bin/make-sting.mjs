import { makeStings } from "../lib/brand.mjs";

// Build the intro/outro stings. Optional args:
//   node bin/make-sting.mjs [bgVideo] [introTagline] [suffix]
// e.g. Azure series stings:
//   node bin/make-sting.mjs assets/higgsfield/datacenter.mp4 "Azure Security Course" -azure
const bgVideo = process.argv[2];
const introTagline = process.argv[3] || "AWS Security Course";
const suffix = process.argv[4] || "";
const { intro, outro } = await makeStings({ bgVideo, introTagline, suffix });
console.log(`✅ Stings →\n  ${intro}\n  ${outro}`);
