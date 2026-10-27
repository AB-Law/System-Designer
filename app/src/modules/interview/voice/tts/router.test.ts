import { describe, expect, it, vi } from "vitest";
import { chunkSentences, TtsRouter } from "./router";
import type { TtsProvider } from "./types";

describe("chunkSentences", () => {
  it("splits on sentence endings and keeps a trailing fragment", () => {
    expect(chunkSentences("Hello. How are you? Fine")).toEqual(["Hello.", "How are you?", "Fine"]);
    expect(chunkSentences("  ")).toEqual([]);
  });
});

function fake(id: "native" | "kokoro", init: () => Promise<void>): TtsProvider {
  return {
    id,
    isSupported: () => true,
    init,
    speak: vi.fn(async () => {}),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("TtsRouter", () => {
  it("falls back to native when kokoro init fails", async () => {
    const native = fake(
      "native",
      vi.fn(async () => {}),
    );
    const kokoro = fake(
      "kokoro",
      vi.fn(async () => {
        throw new Error("missing");
      }),
    );
    const router = new TtsRouter({ native, kokoro });
    router.setPreferred("kokoro");
    await router.init();
    expect(router.activeId()).toBe("native");
    expect(router.didFallBack()).toBe(true);
    expect(kokoro.init).toHaveBeenCalled();
    expect(native.init).toHaveBeenCalled();
  });
});
