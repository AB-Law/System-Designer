import type { TtsProvider, TtsSpeakOptions } from "./types";

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export class NativeTts implements TtsProvider {
  readonly id = "native" as const;
  private utterance: SpeechSynthesisUtterance | null = null;

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async init(): Promise<void> {
    if (!this.isSupported()) throw new Error("Speech synthesis is not available in this browser.");
    // Chrome loads voices asynchronously; nudge once.
    window.speechSynthesis.getVoices();
  }

  speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    if (!this.isSupported()) return Promise.reject(new Error("Speech synthesis is not available."));
    const content = text.trim();
    if (!content) return Promise.resolve();
    this.cancel();

    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(content);
      this.utterance = u;
      const preferred = normalize(options?.preferredVoiceName || "");
      if (preferred) {
        const match = window.speechSynthesis.getVoices().find((v) => normalize(v.name).includes(preferred));
        if (match) u.voice = match;
      }
      u.rate = options?.rate ?? 1;

      const onAbort = () => {
        this.cancel();
        reject(new DOMException("Aborted", "AbortError"));
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });

      u.onend = () => {
        options?.signal?.removeEventListener("abort", onAbort);
        this.utterance = null;
        resolve();
      };
      u.onerror = () => {
        options?.signal?.removeEventListener("abort", onAbort);
        this.utterance = null;
        reject(new Error("Speech playback failed."));
      };
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (!this.isSupported()) return;
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) window.speechSynthesis.cancel();
    this.utterance = null;
  }

  dispose(): void {
    this.cancel();
  }
}
