import { lsGet, lsSet } from "../../../api";
import { DEFAULT_VOICE_PREFS, type TtsProviderId, type VoicePrefs } from "./types";

const KEY = "dc:interview:voice";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function loadPrefs(): VoicePrefs {
  const raw = lsGet<Partial<VoicePrefs>>(KEY, {});
  const provider: TtsProviderId = raw.ttsProvider === "kokoro" ? "kokoro" : "native";
  return {
    handsFree: !!raw.handsFree,
    ttsProvider: provider,
    preferredVoiceName: typeof raw.preferredVoiceName === "string" ? raw.preferredVoiceName : "",
    rate: clamp(typeof raw.rate === "number" ? raw.rate : DEFAULT_VOICE_PREFS.rate, 0.7, 1.4),
    speakInterviewer: raw.speakInterviewer !== false,
  };
}

export function savePrefs(prefs: VoicePrefs): void {
  lsSet(KEY, prefs);
}
