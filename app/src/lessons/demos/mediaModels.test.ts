import { describe, expect, it } from "vitest";
import { CARDS, CRAWL, FILE, bikeStands, crawl, upload, wordSearch } from "./mediaModels";

/*
  Hand calculation.
    Cards: 10,000. Lemon is on 400, thyme on 250, so about 10,000 x 0.04 x 0.025 = 10 have both. The index reads 400 + 250 = 650 list
    entries and opens 10 cards; a scan opens 10,000. Salt is on 7,000: 7,000 entries for a one-word search, and 10,000 x 0.04 x 0.025 x
    0.7 = 7 cards with all three. A new card is 1 piece of work without an index and 1 + 100 words with one.
    File: 2,000 MB at 10 MB/s. It fails at 90% = 1,800 MB. All in one piece (2,000 MB), nothing is kept: send 1,800 + 2,000 = 3,800 MB.
    In 100 MB pieces, 18 pieces arrived: 1,800 kept, 200 MB left: sent 1,800 + 200 = 2,000 MB.
    Crawl: 1,000 addresses at 20 a second = 50 s. The big site has 600: at 2 a second a site, 600 / 2 = 300 s; at 5 a second, 120 s.
*/
describe("demo: a word index", () => {
  it("a scan opens every card; the word lists open only the matches", () => {
    const w = wordSearch(["lemon", "thyme"]);
    expect(w.scanCards).toBe(10_000);
    expect(w.listEntries).toBe(650);
    expect(w.matches).toBe(10);
  });
  it("a common word makes its list long and the search no smaller", () => {
    expect(wordSearch(["salt"]).listEntries).toBe(7000);
    expect(wordSearch(["lemon", "thyme", "salt"]).matches).toBe(7);
  });
  it("adding a card costs far more with the index", () => {
    const w = wordSearch(["lemon"]);
    expect(w.addWithoutIndex).toBe(1);
    expect(w.addWithIndex).toBe(1 + CARDS.wordsPerCard);
  });
  it("choosing no words reads nothing", () => {
    expect(wordSearch([]).matches).toBe(0);
    expect(wordSearch([]).listEntries).toBe(0);
  });
});

describe("demo: a file in pieces", () => {
  it("in one piece, a failure at 90% sends everything again", () => {
    const u = upload(2000, true);
    expect(u.sentMB).toBe(3800);
    expect(upload(2000, false).sentMB).toBe(3800);
  });
  it("in 100 MB pieces, a resume sends only what is missing", () => {
    expect(upload(100, true).sentMB).toBe(2000);
    expect(upload(100, false).sentMB).toBe(3800);
  });
  it("a piece size that does not divide the failure point loses a part-sent piece", () => {
    expect(upload(500, true).sentMB).toBe(1800 + (2000 - 1500));
  });
  it("very small pieces pay a lot of overhead, so a middle size is quickest", () => {
    const t = (mb: number) => upload(mb, true).seconds;
    expect(t(10)).toBeLessThan(t(1));
    expect(t(10)).toBeLessThan(t(500));
    expect(FILE.sizeMB).toBe(2000);
  });
});

describe("demo: a polite crawl", () => {
  it("one global speed with the big site's addresses first hits it at the full speed", () => {
    const c = crawl("found", 0);
    expect(c.peakPerSite).toBe(CRAWL.globalPerSec);
    expect(c.seconds).toBe(50);
    expect(c.coping).toBe(false);
  });
  it("mixing the order spreads the hits but still lets the big site take over half", () => {
    const c = crawl("shuffled", 0);
    expect(c.peakPerSite).toBeCloseTo(12, 6);
    expect(c.coping).toBe(false);
  });
  it("a limit per site protects every site and takes longer", () => {
    const slow = crawl("perSite", 2);
    expect(slow.peakPerSite).toBe(2);
    expect(slow.seconds).toBe(300);
    expect(slow.coping).toBe(true);
    const faster = crawl("perSite", 5);
    expect(faster.seconds).toBe(120);
    expect(faster.coping).toBe(true);
    expect(crawl("perSite", 8).coping).toBe(false);
  });
});

describe("demo: geographic structures", () => {
  it("a tree answers more questions than a grid, and the grid takes more updates", () => {
    const grid = bikeStands("Geohash grid", 1, 1);
    const tree = bikeStands("R-tree", 1, 1);
    expect(tree.queryLimit).toBeGreaterThan(grid.queryLimit);
    expect(grid.updateLimit).toBeGreaterThan(tree.updateLimit);
  });
  it("copies add query capacity and no update capacity", () => {
    const one = bikeStands("Quadtree", 1, 1);
    const three = bikeStands("Quadtree", 1, 3);
    expect(three.queryLimit).toBeGreaterThan(one.queryLimit);
    expect(three.updateLimit).toBeCloseTo(one.updateLimit, 6);
  });
  it("more areas spread a crowded centre and raise both limits", () => {
    const one = bikeStands("Geohash grid", 1, 1);
    const four = bikeStands("Geohash grid", 4, 1);
    expect(four.queryLimit).toBeGreaterThan(one.queryLimit);
    expect(four.updateLimit).toBeGreaterThan(one.updateLimit);
    expect(four.monthlyCost).toBeGreaterThan(one.monthlyCost);
  });
  it("stands rarely move, so the tree serves more of the traffic than the grid", () => {
    expect(bikeStands("R-tree", 1, 1).served).toBeGreaterThan(bikeStands("Geohash grid", 1, 1).served);
  });
  it("with a very high share of updates, as with moving cars, the R-tree falls behind the other two", () => {
    const at = (st: string) => bikeStands(st, 1, 1, 0.6);
    expect(at("Geohash grid").served).toBeGreaterThan(at("R-tree").served);
    expect(at("Quadtree").served).toBeGreaterThan(at("R-tree").served);
    expect(at("Geohash grid").updateLimit).toBeGreaterThan(at("R-tree").updateLimit);
  });
});
