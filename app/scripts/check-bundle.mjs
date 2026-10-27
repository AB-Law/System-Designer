// Fails when the initial JS bundle grows more than 5% past the recorded baseline.
// Run after `npm run build`. To accept an intentional change, update bundle-baseline.json in the same PR.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const assets = new URL("../dist/assets/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const baseline = JSON.parse(readFileSync(new URL("./bundle-baseline.json", import.meta.url), "utf8"));
const LIMIT = 1.05;

const files = readdirSync(assets).filter((f) => f.endsWith(".js"));
const entry = files.find((f) => f.startsWith("index-"));
if (!entry) {
  console.error("no index-*.js found in dist/assets; did the build run?");
  process.exit(1);
}
const bytes = statSync(join(assets, entry)).size;
const gzip = gzipSync(readFileSync(join(assets, entry))).length;
const max = Math.round(baseline.bytes * LIMIT);
console.log(`initial bundle ${bytes} B (gzip ${gzip}); baseline ${baseline.bytes}; limit ${max}`);
if (bytes > max) {
  console.error(`initial bundle is ${(((bytes / baseline.bytes) - 1) * 100).toFixed(1)}% over baseline (limit +5%)`);
  process.exit(1);
}
