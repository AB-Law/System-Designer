import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../ui/EmptyState";
import { checkFile } from "../ui/FileDrop";
import { ProgressBar, pct } from "../ui/ProgressBar";
import { ScoreRing, ringTone } from "../ui/ScoreRing";
import { Tabs } from "../ui/Tabs";
import { Table } from "../ui/Table";
import { DESIGN, activeModules, availability, enabledFlags, enabledModules, featureOn } from "./registry";
import { moduleHash, parseModuleHash } from "./route";
import type { ModuleDef } from "./types";

const cv: ModuleDef = { id: "cv", title: "CV", hashPrefix: "#/cv", requires: ["backend", "auth"], flag: "cv" };
const jobs: ModuleDef = { id: "jobs", title: "Jobs", hashPrefix: "#/jobs", requires: ["backend", "auth"], flag: "jobs" };
const mods = [DESIGN, cv, jobs];

describe("module flags", () => {
  it("defaults to Design only, and Design is always on", () => {
    expect([...enabledFlags(undefined)]).toEqual(["design"]);
    expect(enabledFlags("cv, jobs").has("design")).toBe(true);
  });
  it("keeps only enabled modules, Design first", () => {
    expect(enabledModules([cv, jobs], enabledFlags(undefined)).map((m) => m.id)).toEqual(["design"]);
    expect(enabledModules([cv, jobs], enabledFlags("jobs,cv")).map((m) => m.id)).toEqual(["design", "cv", "jobs"]);
  });
  it("ignores a module that tries to reuse the design id", () => {
    const fake: ModuleDef = { ...cv, id: "design", flag: "cv" };
    expect(enabledModules([fake], enabledFlags("cv")).map((m) => m.title)).toEqual(["Design"]);
  });
  it("a default build shows no module switcher (only Design)", () => {
    expect(activeModules().map((m) => m.id)).toEqual(["design"]);
  });
  it("slice flags are tokens, not modules", () => {
    expect(enabledFlags("interview,interview.voice").has("interview.voice")).toBe(true);
    expect(enabledModules([cv], enabledFlags("interview,interview.voice")).map((m) => m.id)).toEqual(["design"]);
  });
});

describe("featureOn", () => {
  it("reads the same flag set as modules (default off for voice)", () => {
    // Without VITE_ENABLED_MODULES in the test env, only design is on.
    expect(featureOn("design")).toBe(true);
    expect(featureOn("interview.voice")).toBe(false);
  });
});

describe("module hash routing", () => {
  it("maps a hash to its module and the rest of the path", () => {
    expect(parseModuleHash("#/cv", mods)?.rest).toBe("");
    expect(parseModuleHash("#/cv/upload", mods)).toMatchObject({ module: { id: "cv" }, rest: "upload" });
    expect(parseModuleHash("#/jobs/12/edit", mods)?.rest).toBe("12/edit");
  });
  it("leaves Design's own hashes and lookalikes alone", () => {
    expect(parseModuleHash("", mods)).toBeNull();
    expect(parseModuleHash("#/learn/caching", mods)).toBeNull();
    expect(parseModuleHash("#/cvs", mods)).toBeNull();
    expect(parseModuleHash("#/cv-extra", mods)).toBeNull();
  });
  it("round-trips", () => {
    const r = parseModuleHash(moduleHash(cv, "a/b"), mods);
    expect(r?.rest).toBe("a/b");
    expect(moduleHash(cv)).toBe("#/cv");
  });
});

describe("availability", () => {
  it("explains what a module is missing", () => {
    expect(availability(cv, { backendOnline: false, signedIn: false })).toBe("needs-backend");
    expect(availability(cv, { backendOnline: true, signedIn: false })).toBe("needs-signin");
    expect(availability(cv, { backendOnline: true, signedIn: true })).toBe("ok");
    expect(availability(DESIGN, { backendOnline: false, signedIn: false })).toBe("ok");
  });
});

describe("ui kit", () => {
  it("clamps progress and score", () => {
    expect([pct(-5), pct(42.4), pct(180), pct(NaN)]).toEqual([0, 42, 100, 0]);
    expect([ringTone(10), ringTone(60), ringTone(90)]).toEqual(["bad", "warn", "good"]);
  });
  it("renders accessible progress, ring, empty state and tabs", () => {
    expect(renderToStaticMarkup(createElement(ProgressBar, { value: 30, label: "Parsing" }))).toContain('aria-valuenow="30"');
    expect(renderToStaticMarkup(createElement(ScoreRing, { value: 72 }))).toContain("Score 72 out of 100");
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "Nothing" }))).toContain('role="status"');
    const tabs = renderToStaticMarkup(
      createElement(Tabs, {
        label: "t",
        active: "b",
        onChange: () => {},
        tabs: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      }),
    );
    expect(tabs).toContain('aria-selected="true"');
  });
  it("shows the empty text for an empty table", () => {
    const html = renderToStaticMarkup(
      createElement(Table<number>, { columns: [], rows: [], rowKey: (r: number) => r, empty: "No CVs yet." }),
    );
    expect(html).toContain("No CVs yet.");
  });
  it("validates uploads before they leave the browser", () => {
    const opts = { accept: [".pdf", ".docx"], maxBytes: 5 * 1024 * 1024 };
    expect(checkFile({ name: "cv.PDF", size: 1000 }, opts)).toBeNull();
    expect(checkFile({ name: "cv.txt", size: 1000 }, opts)).toMatch(/\.pdf/);
    expect(checkFile({ name: "cv.pdf", size: 6 * 1024 * 1024 }, opts)).toMatch(/5 MB/);
    expect(checkFile({ name: "cv.pdf", size: 0 }, opts)).toMatch(/empty/);
  });
});

describe("design module wrapper", () => {
  it("re-exports the existing Design Canvas pieces and the shell's Design definition", async () => {
    const design = await import("../modules/design");
    expect(design.default).toBe(DESIGN);
    for (const name of ["DesignApp", "DesignTopBar", "HomeScreen", "LearnScreen", "RoadmapScreen", "SharedView"] as const) {
      expect(typeof design[name]).toBe("function");
    }
    expect(typeof design.useDesignStore.getState).toBe("function");
  });
});
