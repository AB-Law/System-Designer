import type { TtsProviderId } from "../types";

export interface TtsSpeakOptions {
  preferredVoiceName?: string;
  rate?: number;
  signal?: AbortSignal;
}

export interface TtsProvider {
  readonly id: TtsProviderId;
  isSupported(): boolean;
  init(): Promise<void>;
  speak(text: string, options?: TtsSpeakOptions): Promise<void>;
  cancel(): void;
  dispose(): void;
}
