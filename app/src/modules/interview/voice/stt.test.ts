import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVoiceKey, setVoiceKey } from "./key";
import { transcribeBlob } from "./stt";

const audio = () => new Blob(["x"], { type: "audio/webm" });

const store = new Map<string, string>();

describe("transcribeBlob", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips the voice key through localStorage", () => {
    setVoiceKey("  sk-test  ");
    expect(getVoiceKey()).toBe("sk-test");
  });

  it("calls OpenAI directly with the user's key when one is saved", async () => {
    setVoiceKey("sk-mine");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: " hello " }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeBlob(1, audio())).resolves.toBe("hello");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer sk-mine");
  });

  it("explains a rejected key", async () => {
    setVoiceKey("sk-bad");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(transcribeBlob(1, audio())).rejects.toThrow(/rejected your voice key/);
  });
});
