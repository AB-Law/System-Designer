import { describe, expect, it } from "vitest";
import { PARCELS, SHOP, orderNotes, parcels, shop } from "./dataModels";

/*
  Hand calculation, using the app's costs (a scan reads a row at 1/1000 of a lookup, an index fetch is 1/200 a row, sorting is 1/500
  a row, and every write updates every index at 0.4 each).
    no index: 1 + 1,000,000/1000 + 50/500 = 1,001.1 units, best possible 1 + 3/200 = 1.015  -> about 986 times the best
    index on customer: 1 + 50/200 + 50/500 = 1.35 (the 50 matches are sorted in memory)
    index on customer then date: 1 + 3/200 = 1.015 (already in order, the best there is)
    taking an order: 1 + 0.4 x the number of indexes
  Shards: skew is 1 / (1 + skew-of-key x (shards - 1)). A time column only grows, so it scores 0.9: 1 / (1 + 0.9 x 7) = 0.137.
  A column with 200 values scores 8/sqrt(200) = 0.566: 1 / (1 + 0.566 x 7) = 0.201. A column with 50 million values scores 0.0011.
*/
describe("demo: query plans and indexes", () => {
  it("with no index the question reads every row", () => {
    const o = shop([]);
    expect(o.scan).toBe(true);
    expect(o.readUnits).toBeCloseTo(1001.1, 1);
    expect(o.bestUnits).toBeCloseTo(1.015, 3);
    expect(o.readUnits / o.bestUnits).toBeGreaterThan(900);
  });
  it("an index on the customer alone leaves a sort in memory", () => {
    const o = shop(["orders:customer_id"]);
    expect(o.scan).toBe(false);
    expect(o.readUnits).toBeCloseTo(1.35, 2);
  });
  it("an index on customer then date is as good as it gets", () => {
    const o = shop(["orders:customer_id,placed_at"]);
    expect(o.readUnits).toBeCloseTo(o.bestUnits, 6);
  });
  it("an index nobody's question uses does not help the read", () => {
    expect(shop(["orders:status"]).readUnits).toBeCloseTo(shop([]).readUnits, 6);
  });
  it("every index makes taking an order dearer", () => {
    expect(shop([]).writeUnits).toBeCloseTo(1, 6);
    expect(shop(["orders:customer_id,placed_at"]).writeUnits).toBeCloseTo(1.4, 6);
    expect(shop(["orders:customer_id,placed_at", "orders:placed_at", "orders:status"]).writeUnits).toBeCloseTo(2.2, 6);
  });
  it("the right index lets the shop serve its traffic, and no index cannot", () => {
    expect(shop([]).served).toBeLessThan(0.1);
    expect(shop(["orders:customer_id,placed_at"]).served).toBe(1);
  });
  it("indexes cost money", () => {
    expect(shop(["orders:customer_id,placed_at"]).monthlyCost).toBeGreaterThan(shop([]).monthlyCost);
  });
  it("on a write-heavy mix, unneeded indexes cut the write limit", () => {
    const lean = shop(["orders:customer_id,placed_at"], 0.5);
    const heavy = shop(["orders:customer_id,placed_at", "orders:placed_at", "orders:status", "orders:customer_id"], 0.5);
    expect(heavy.writeLimit).toBeLessThan(lean.writeLimit);
    expect(SHOP.rows).toBe(1_000_000);
  });
});

describe("demo: choosing a partition key", () => {
  it("a time column puts nearly everything on one slice", () => {
    const o = parcels("scanned_at");
    expect(o.usable).toBeCloseTo(1 / (1 + 0.9 * 7), 3);
    expect(o.busiest).toBeGreaterThan(0.5);
  });
  it("a column with few values is lumpy", () => {
    expect(parcels("depot_id").usable).toBeCloseTo(0.201, 2);
  });
  it("a column with many values spreads load almost evenly", () => {
    const o = parcels("parcel_id");
    expect(o.usable).toBeGreaterThan(0.98);
    expect(o.busiest).toBeCloseTo(1 / PARCELS.shards, 1);
  });
  it("a question without the key is asked of every slice", () => {
    expect(parcels("parcel_id").historyScatters).toBe(false);
    expect(parcels("parcel_id").depotScatters).toBe(true);
    expect(parcels("depot_id").historyScatters).toBe(true);
    expect(parcels("depot_id").depotScatters).toBe(false);
    expect(parcels("none").historyScatters).toBe(true);
  });
  it("the evenly spread key serves more than the lumpy ones", () => {
    expect(parcels("parcel_id").served).toBeGreaterThan(parcels("scanned_at").served);
    expect(parcels("parcel_id").served).toBeGreaterThan(parcels("depot_id").served);
  });
});

describe("demo: a first look at search", () => {
  it("word searches on the main database trigger the app's warning, and a search index removes it", () => {
    expect(orderNotes(false).searchFinding).toBe(true);
    expect(orderNotes(true).searchFinding).toBe(false);
  });
  it("the search index costs money and takes the notes off the database", () => {
    expect(orderNotes(true).monthlyCost).toBeGreaterThan(orderNotes(false).monthlyCost);
    expect(orderNotes(false).notesRead).toBe(1_000_000);
    expect(orderNotes(true).notesRead).toBe(0);
  });
});
