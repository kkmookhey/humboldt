import { loginAndSave } from "../lib/auth.mjs";

const cloud = process.argv[2];
if (!cloud) {
  console.error("usage: node bin/login.mjs <aws|azure|gcp>");
  process.exit(1);
}
await loginAndSave(cloud);
