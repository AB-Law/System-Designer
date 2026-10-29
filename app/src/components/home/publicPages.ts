/** The public lesson pages written by scripts/prerender.mjs. A test keeps these slugs in step with content/lessons. */
export const PUBLIC_LESSONS = [
  { slug: "first-designs", title: "First designs", minutes: 20 },
  { slug: "traffic-copies-and-correctness", title: "Traffic, copies and correctness", minutes: 22 },
  { slug: "work-that-happens-later", title: "Work that happens later", minutes: 24 },
  { slug: "data-and-query-shape", title: "Data and query shape", minutes: 32 },
  { slug: "search-maps-and-media", title: "Search, maps and media", minutes: 28 },
  { slug: "real-time-decisions-and-money", title: "Real-time decisions and money", minutes: 30 },
] as const;
