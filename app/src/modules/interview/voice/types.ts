export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export type TtsProviderId = "native" | "kokoro";

export interface VoicePrefs {
  handsFree: boolean;
  ttsProvider: TtsProviderId;
  preferredVoiceName: string;
  rate: number;
  speakInterviewer: boolean;
}

export interface Capability {
  ok: boolean;
  mic: boolean;
  speechSynthesis: boolean;
  message: string | null;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  handsFree: false,
  ttsProvider: "native",
  preferredVoiceName: "",
  rate: 1,
  speakInterviewer: true,
};

export const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "Voice idle",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};
