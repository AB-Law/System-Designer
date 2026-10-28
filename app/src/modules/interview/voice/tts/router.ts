import type { TtsProviderId } from "../types";
import { KokoroTts } from "./kokoro";
import { NativeTts } from "./native";
import type { TtsProvider, TtsSpeakOptions } from "./types";

const SENTENCE = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;

export class TtsRouter {
  private preferred: TtsProviderId = "native";
  private active: TtsProvider;
  private native: TtsProvider;
  private kokoro: TtsProvider;
  private fellBack = false;

  constructor(providers?: { native?: TtsProvider; kokoro?: TtsProvider }) {
    this.native = providers?.native ?? new NativeTts();
    this.kokoro = providers?.kokoro ?? new KokoroTts();
    this.active = this.native;
  }

  setPreferred(id: TtsProviderId): void {
    this.preferred = id;
    this.fellBack = false;
  }

  activeId(): TtsProviderId {
    return this.active.id;
  }

  async init(): Promise<void> {
    const primary = this.preferred === "kokoro" ? this.kokoro : this.native;
    try {
      if (!primary.isSupported()) throw new Error("unsupported");
      await primary.init();
      this.active = primary;
    } catch {
      if (primary.id === "native") throw new Error("Speech synthesis is not available.");
      await this.native.init();
      this.active = this.native;
      this.fellBack = true;
    }
  }

  didFallBack(): boolean {
    return this.fellBack;
  }

  async speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    await this.init();
    const chunks = chunkSentences(text);
    for (const chunk of chunks) {
      if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await this.active.speak(chunk, options);
    }
  }

  cancel(): void {
    this.active.cancel();
    this.native.cancel();
    this.kokoro.cancel();
  }

  dispose(): void {
    this.native.dispose();
    this.kokoro.dispose();
  }
}

export function chunkSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.match(SENTENCE);
  return (parts ?? [trimmed]).map((p) => p.trim()).filter(Boolean);
}
