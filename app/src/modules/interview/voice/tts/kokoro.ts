import type { TtsProvider, TtsSpeakOptions } from "./types";

type KokoroEngine = {
  generate: (text: string, opts?: { voice?: string }) => Promise<{ audio: Float32Array; sampling_rate: number }>;
};

type KokoroModule = {
  KokoroTTS?: { from_pretrained: (id: string, opts?: object) => Promise<KokoroEngine> };
  default?: { from_pretrained: (id: string, opts?: object) => Promise<KokoroEngine> };
};

/**
 * Opt-in in-browser model voice. Loaded only after the user picks Kokoro.
 * Requires optional packages (`kokoro-js`); if they are missing, init fails and the router falls back to native.
 */
export class KokoroTts implements TtsProvider {
  readonly id = "kokoro" as const;
  private tts: KokoroEngine | null = null;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    if (
      typeof AudioContext === "undefined" &&
      typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext === "undefined"
    ) {
      return false;
    }
    // Keep mobile on native — model download is heavy.
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")) return false;
    return true;
  }

  async init(): Promise<void> {
    if (!this.isSupported()) throw new Error("Kokoro voices are not supported here.");
    if (this.tts) return;
    try {
      // Optional peer dependency — not part of the default Design Canvas bundle.
      const specifier = "kokoro-js";
      const mod = (await import(/* @vite-ignore */ specifier)) as KokoroModule;
      const Ctor = mod.KokoroTTS ?? mod.default;
      if (!Ctor?.from_pretrained) throw new Error("kokoro_api_missing");
      this.tts = await Ctor.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8" });
    } catch {
      throw new Error("Kokoro voices are not installed. Use the browser voice, or add kokoro-js.");
    }
  }

  async speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    const content = text.trim();
    if (!content) return;
    await this.init();
    if (!this.tts) throw new Error("Kokoro is not ready.");
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const result = await this.tts.generate(content);
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
    this.ctx ??= new AC();
    const buffer = this.ctx.createBuffer(1, result.audio.length, result.sampling_rate);
    buffer.copyToChannel(Float32Array.from(result.audio), 0);
    this.cancelSourceOnly();

    await new Promise<void>((resolve, reject) => {
      const source = this.ctx!.createBufferSource();
      this.source = source;
      source.buffer = buffer;
      source.connect(this.ctx!.destination);
      const onAbort = () => {
        this.cancelSourceOnly();
        reject(new DOMException("Aborted", "AbortError"));
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      source.onended = () => {
        options?.signal?.removeEventListener("abort", onAbort);
        this.source = null;
        resolve();
      };
      source.start();
    });
  }

  cancel(): void {
    this.cancelSourceOnly();
  }

  dispose(): void {
    this.cancel();
    void this.ctx?.close();
    this.ctx = null;
    this.tts = null;
  }

  private cancelSourceOnly(): void {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
  }
}
