import { interviewApi } from "../api";

export async function transcribeBlob(sessionId: number, blob: Blob): Promise<string> {
  if (!blob.size) throw new Error("No audio was captured. Try again, or type your answer.");
  const { text } = await interviewApi.transcribe(sessionId, blob);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No speech was detected. Try again, or type your answer.");
  return trimmed;
}
