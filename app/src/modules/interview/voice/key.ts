import { lsGet, lsSet } from "../../../api";

/** The user's own OpenAI key for speech-to-text. Kept in this browser only: never sent to our server. */
const KEY = "dc:interview:voice-key";

export const getVoiceKey = (): string => {
  const v = lsGet<unknown>(KEY, "");
  return typeof v === "string" ? v.trim() : "";
};

export const setVoiceKey = (key: string): void => {
  lsSet(KEY, key.trim());
};
