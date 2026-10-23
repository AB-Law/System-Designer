// Runs every sample design and prints one line each: scenarios passed, cost, budget.
import { execSync } from "node:child_process";
const files = ["try-all.ts", "try-batch2.ts", "try-batch3.ts", "try-batch4.ts", "try-ads.ts", "try-regions.ts"];
for (const f of files) {
  const out = execSync(`npx tsx scripts/${f}`, { encoding: "utf8" });
  let head = "";
  let pass = 0, total = 0;
  const flush = () => { if (head) console.log(`${pass}/${total}  ${head}`); };
  for (const line of out.split("\n")) {
    if (line.startsWith("==")) { flush(); head = line.replace(/^== /, ""); pass = 0; total = 0; }
    else if (/\b(PASS|FAIL)\b/.test(line)) { total++; if (line.includes(" PASS")) pass++; }
  }
  flush();
}
