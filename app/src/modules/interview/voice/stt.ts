import { interviewApi } from "../api";
import { getVoiceKey } from "./key";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

const suffixFor = (mime: string): string => {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("wav")) return ".wav";
  if (m.includes("mpeg")) return ".mp3";
  return ".webm";
};

/** Straight to OpenAI with the user's own key, so the key never touches our server. */
async function transcribeDirect(blob: Blob, key: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `speech${suffixFor(blob.type)}`);
  form.append("model", "whisper-1");
  form.append("language", "en");
  let res: Response;
  try {
    res = await fetch(WHISPER_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  } catch {
    throw new Error("Transcription could not reach OpenAI. Check your connection, or type your answer.");
  }
  if (res.status === 401) throw new Error("OpenAI rejected your voice key. Check it in Voice settings.");
  if (!res.ok) throw new Error(`Transcription failed (${res.status}). Try again, or type your answer.`);
  const body = (await res.json()) as { text?: string };
  return body.text ?? "";
}

export async function transcribeBlob(sessionId: number, blob: Blob): Promise<string> {
  if (!blob.size) throw new Error("No audio was captured. Try again, or type your answer.");
  const key = getVoiceKey();
  const text = key ? await transcribeDirect(blob, key) : (await interviewApi.transcribe(sessionId, blob)).text;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No speech was detected. Try again, or type your answer.");
  return trimmed;
}
