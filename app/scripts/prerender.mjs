// Static, crawlable pages for the public content, written into dist/ after `vite build`.
//
//   /learn/                 lesson index            /learn/<slug>/      one lesson
//   /problems/              problem index           /problems/<id>/     one problem brief
//   /sitemap.xml  /robots.txt
//
// The app itself stays a client-rendered hash-routed SPA; these pages carry the text and link into it.
// Set SITE_URL (for example https://designcanvas.example) so canonical links and the sitemap are absolute.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const NAME = "Design Canvas";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const plain = (s) => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
const trim = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,.;:]$/, "") + "…");
const url = (path) => `${SITE}${path}`;

/* ---------- content ---------- */

function parseLesson(file) {
  const raw = readFileSync(join(root, "content/lessons", file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => l.split(/:\s*/, 2)));
  const pages = [];
  let page = null;
  let block = null; // an open ::: block
  for (const line of m[2].split("\n")) {
    const h = line.match(/^## (.+?)(?: \{#[\w-]+\})?$/);
    if (h) {
      page = { title: h[1], parts: [] };
      pages.push(page);
      continue;
    }
    if (!page) continue;
    if (block) {
      if (line === ":::") {
        if (block.kind === "quiz") page.parts.push(block);
        if (block.kind === "summary") page.parts.push(block);
        block = null;
      } else block.lines.push(line);
      continue;
    }
    const b = line.match(/^::: (\w+)/);
    if (b) block = { kind: b[1], lines: [] };
    else if (line.trim()) page.parts.push({ kind: "p", text: line.trim() });
  }
  return { title: meta.title, minutes: Number(meta.minutes) || null, pages };
}

const lessons = readdirSync(join(root, "content/lessons"))
  .filter((f) => /^module-\d+\.md$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
  .map((f) => {
    const l = parseLesson(f);
    return { ...l, slug: slug(l.title) };
  });

const problems = readdirSync(join(root, "src/problems"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(root, "src/problems", f), "utf8")))
  .sort((a, b) => ["easy", "medium", "hard"].indexOf(a.difficulty) - ["easy", "medium", "hard"].indexOf(b.difficulty));

/* ---------- page shell ---------- */

const CSS = `
:root{--edge:max(clamp(16px,4vw,56px),calc((100% - 1360px)/2));--bg:#08080a;--panel:#121114;--raise:#201e22;--text:#ece6d4;--muted:#a39b84;--gold:#d4b45a;--gold-hi:#ecd48a;--display:"Instrument Serif","Iowan Old Style",Georgia,serif;--body:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark}
*{box-sizing:border-box}html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 var(--body);-webkit-font-smoothing:antialiased}
a{color:var(--gold-hi)}a:hover{color:var(--text)}:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
header.bar{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:14px var(--edge);background:var(--panel)}
.brand{font:400 26px/1 var(--display);color:var(--gold);text-decoration:none}
.bar nav{display:flex;gap:20px;flex:1}.bar nav a{color:var(--muted);text-decoration:none;font-weight:600}.bar nav a:hover{color:var(--text)}
.btn{display:inline-block;padding:10px 18px;border-radius:8px;background:var(--gold);color:#1a1405;font-weight:700;text-decoration:none}.btn:hover{background:var(--gold-hi);color:#1a1405}
main{padding:56px var(--edge) 96px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:clamp(32px,5vw,80px);align-items:start}
aside{position:sticky;top:24px;display:grid;gap:16px}aside h2{margin:0 0 8px;font-size:28px}aside .cta{margin:0;display:grid;padding:24px}aside .cta p{font-size:24px}
.toc{list-style:none;margin:0;padding:0;display:grid;gap:4px}.toc a{display:block;padding:8px 12px;border-radius:8px;color:var(--muted);text-decoration:none}.toc a:hover{background:var(--raise);color:var(--text)}
.facts{display:grid;gap:10px;margin:0}.facts div{display:flex;justify-content:space-between;gap:16px;padding:10px 14px;background:var(--bg);border-radius:8px}.facts dt{color:var(--muted)}.facts dd{margin:0;font-weight:600}
@media(max-width:1000px){.layout{grid-template-columns:1fr}aside{position:static}}
.rv-on [data-rv]{opacity:0;transform:translateY(20px);transition:opacity .5s ease var(--d,0ms),transform .5s ease var(--d,0ms)}.rv-on [data-rv].rv-in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.rv-on [data-rv]{transform:none;transition:opacity .2s}}
h1{margin:0 0 16px;font:400 clamp(40px,6vw,72px)/1.02 var(--display);letter-spacing:-.02em;max-width:20ch}
h2{margin:56px 0 12px;font:400 clamp(28px,3.4vw,40px)/1.1 var(--display);letter-spacing:-.01em}
.lede{max-width:60ch;color:var(--muted);font-size:20px;margin:0 0 28px}
p,li{max-width:68ch}ul{padding-left:20px}
.crumbs{margin:0 0 24px;color:var(--muted);font-size:14px}.crumbs a{color:var(--muted)}
.list{list-style:none;padding:0;margin:32px 0 0;display:grid;gap:8px}
.list li{max-width:none}.list a{display:flex;justify-content:space-between;gap:16px;padding:18px 20px;background:var(--panel);border-radius:10px;text-decoration:none;color:var(--text)}
.list a:hover{background:var(--raise)}.list b{font:400 24px/1.2 var(--display)}.list span{color:var(--muted);align-self:center;white-space:nowrap}
.panel{background:var(--panel);border-radius:12px;padding:20px 24px;margin:16px 0}
.panel h3{margin:0 0 8px;font:400 22px/1.2 var(--display)}
details{background:var(--panel);border-radius:10px;padding:14px 18px;margin:16px 0}summary{cursor:pointer;font-weight:600}
.cta{margin-top:56px;padding:28px;background:var(--panel);border-radius:14px;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.cta p{margin:0;font:400 28px/1.2 var(--display);max-width:28ch}
footer{padding:32px clamp(16px,4vw,56px);color:var(--muted);font-size:14px;background:var(--panel)}
`;

const REVEAL = `document.documentElement.classList.add("rv-on");var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("rv-in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -6% 0px"});document.querySelectorAll("[data-rv]").forEach(function(n){io.observe(n)})`;

function page({ path, title, description, body, aside = "", type = "WebPage", extra = {} }) {
  const full = `${title} | ${NAME}`;
  const canonical = SITE ? `<link rel="canonical" href="${esc(url(path))}">` : "";
  const ld = { "@context": "https://schema.org", "@type": type, name: title, description, ...(SITE ? { url: url(path) } : {}), ...extra };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
${canonical}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
${SITE ? `<meta property="og:url" content="${esc(url(path))}">\n` : ""}<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#08080a">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="bar"><a class="brand" href="/">${NAME}</a><nav aria-label="Sections"><a href="/learn/">Learn</a><a href="/problems/">Problems</a></nav><a class="btn" href="/#/design">Open the canvas</a></header>
<main>
<div class="layout">
<div class="article">
${body}
</div>
${aside ? `<aside>${aside}</aside>` : ""}
</div>
</main>
<footer>${NAME}. System design practice for interviews.</footer>
<script>${REVEAL}</script>
</body>
</html>
`;
}

const write = (path, html) => {
  const dir = join(dist, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
};

/* ---------- learn ---------- */

const cta = (text) => `<div class="cta"><p>${esc(text)}</p><a class="btn" href="/#/design">Open the canvas</a></div>`;
const stack = (...parts) => parts.join("\n");

write(
  "learn",
  page({
    path: "/learn/",
    title: "Learn system design",
    description: `${lessons.length} short lessons on how systems handle traffic, data and failure, each with a live demo in the canvas.`,
    type: "CollectionPage",
    body: `<h1>Learn system design</h1>
<p class="lede">Short lessons on how a system handles traffic, data and failure. Each one pairs plain explanation with a live demo you can break.</p>
<ol class="list" data-rv>${lessons
      .map((l, i) => `<li><a href="/learn/${l.slug}/"><b>${esc(l.title)}</b><span>${l.pages.length} pages${l.minutes ? `, ${l.minutes} min` : ""}</span></a></li>`)
      .join("")}</ol>`,
    aside: cta("Build it, break it, learn why."),
  }),
);

for (const l of lessons) {
  const first = l.pages[0]?.parts.find((p) => p.kind === "p");
  const description = trim(plain(first?.text ?? `${l.title}, a ${NAME} lesson.`), 155);
  const sections = l.pages
    .map((pg) => {
      const parts = pg.parts
        .map((p) => {
          if (p.kind === "p") return `<p>${esc(plain(p.text))}</p>`;
          if (p.kind === "summary") return `<div class="panel"><h3>In short</h3><ul>${p.lines.filter((x) => x.startsWith("- ")).map((x) => `<li>${esc(plain(x.slice(2)))}</li>`).join("")}</ul></div>`;
          if (p.kind === "quiz") {
            const q = p.lines.filter((x) => !/^(- \[|>)/.test(x)).join(" ");
            const right = p.lines.find((x) => x.startsWith("- [x]"))?.slice(6) ?? "";
            const why = p.lines.find((x) => x.startsWith(">"))?.slice(2) ?? "";
            return `<details data-rv><summary>Check yourself: ${esc(plain(q))}</summary><p><b>${esc(plain(right))}</b></p>${why ? `<p>${esc(plain(why))}</p>` : ""}</details>`;
          }
          return "";
        })
        .join("\n");
      return `<section><h2 id="${slug(pg.title)}" data-rv>${esc(pg.title)}</h2>\n${parts}</section>`;
    })
    .join("\n");
  write(
    `learn/${l.slug}`,
    page({
      path: `/learn/${l.slug}/`,
      title: l.title,
      description,
      type: "LearningResource",
      extra: { educationalLevel: "Beginner", learningResourceType: "lesson", ...(l.minutes ? { timeRequired: `PT${l.minutes}M` } : {}) },
      aside: stack(
        `<div class="panel" data-rv><h2>On this page</h2><ol class="toc">${l.pages.map((pg) => `<li><a href="#${slug(pg.title)}">${esc(pg.title)}</a></li>`).join("")}</ol></div>`,
        cta("Try this in the canvas, with real traffic."),
      ),
      body: `<h1>${esc(l.title)}</h1>
<p class="lede" data-rv>${esc(description)}</p>
${sections}`,
    }),
  );
}

/* ---------- problems ---------- */

write(
  "problems",
  page({
    path: "/problems/",
    title: "System design interview problems",
    description: `${problems.length} system design practice problems, from a personal blog to ride sharing, each with traffic numbers, constraints and failure scenarios.`,
    type: "CollectionPage",
    body: `<h1>System design interview problems</h1>
<p class="lede">Each problem gives you a brief, real traffic numbers and the failures to survive. Design it on the canvas and the simulator tells you what held.</p>
<ul class="list" data-rv>${problems
      .map((p) => `<li><a href="/problems/${p.id}/"><b>${esc(p.title)}</b><span>${esc(p.difficulty)}</span></a></li>`)
      .join("")}</ul>`,
    aside: cta("Pick one and build it."),
  }),
);

for (const p of problems) {
  const description = trim(plain(p.brief), 155);
  write(
    `problems/${p.id}`,
    page({
      path: `/problems/${p.id}/`,
      title: p.title,
      description,
      type: "LearningResource",
      extra: { learningResourceType: "practice problem", educationalLevel: p.difficulty },
      aside: stack(
        `<div class="panel" data-ui data-rv><h2>Traffic and budget</h2><dl class="facts">${[
          ["Difficulty", p.difficulty],
          p.traffic?.users != null && ["Users", p.traffic.users.toLocaleString("en-US")],
          p.traffic?.reqPerUser != null && ["Requests per user per second", String(p.traffic.reqPerUser)],
          p.traffic?.writeShare != null && ["Share that are writes", `${Math.round(p.traffic.writeShare * 100)}%`],
          p.latencyTargetMs != null && ["Latency target", `${p.latencyTargetMs} ms`],
          p.budget != null && ["Monthly budget", `$${Number(p.budget).toLocaleString("en-US")}`],
        ]
          .filter(Boolean)
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
          .join("")}</dl></div>`,
        cta(`Design ${p.title.replace(/^Design (an? )?/i, "")} on the canvas.`),
      ),
      body: `<h1>${esc(p.title)}</h1>
<p class="lede" data-rv>${esc(plain(p.brief))}</p>
<h2 data-rv>Constraints</h2>
<div class="panel" data-rv><ul>${(p.constraints ?? []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
<h2 data-rv>Scenarios to survive</h2>
${(p.scenarios ?? []).map((sc) => `<div class="panel" data-rv><h3>${esc(sc.title)}</h3><p>${esc(sc.description)}</p>${sc.interviewQuestion ? `<p><b>Interviewer asks:</b> ${esc(sc.interviewQuestion)}</p>` : ""}</div>`).join("\n")}
<h2 data-rv>What a good design must do</h2>
<div class="panel" data-rv><ul>${(p.requirements ?? []).map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul></div>`,
    }),
  );
}

/* ---------- sitemap and robots ---------- */

const paths = ["/", "/learn/", "/problems/", ...lessons.map((l) => `/learn/${l.slug}/`), ...problems.map((p) => `/problems/${p.id}/`)];
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${esc(url(p))}</loc></url>`).join("\n")}\n</urlset>\n`,
);
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n${SITE ? `Sitemap: ${url("/sitemap.xml")}\n` : ""}`);
console.log(`prerendered ${paths.length - 1} pages${SITE ? "" : " (SITE_URL unset: canonical links and sitemap are relative)"}`);
