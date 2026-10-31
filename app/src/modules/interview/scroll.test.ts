import { describe, expect, it } from "vitest";
import { scrollToEnd } from "./scroll";

describe("scrollToEnd", () => {
  it("moves the container to the bottom so the newest question is visible", () => {
    const el = { scrollTop: 0, scrollHeight: 1200 };
    scrollToEnd(el);
    expect(el.scrollTop).toBe(1200);
  });

  it("follows the content as it grows", () => {
    const el = { scrollTop: 0, scrollHeight: 400 };
    scrollToEnd(el);
    el.scrollHeight = 900;
    scrollToEnd(el);
    expect(el.scrollTop).toBe(900);
  });

  it("ignores a missing element", () => {
    expect(() => scrollToEnd(null)).not.toThrow();
  });
});
