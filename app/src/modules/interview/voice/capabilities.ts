import type { Capability } from "./types";

/** Check mic and speech synthesis up front so the UI can show a clear message. */
export function checkCapabilities(): Capability {
  if (typeof window === "undefined") {
    return { ok: false, mic: false, speechSynthesis: false, message: "Voice needs a browser window." };
  }
  const secure = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!secure) {
    return { ok: false, mic: false, speechSynthesis: false, message: "Voice needs HTTPS (or localhost)." };
  }
  const mic = !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
  const speechSynthesis = "speechSynthesis" in window;
  if (!mic) {
    return { ok: false, mic: false, speechSynthesis, message: "This browser cannot record from the microphone." };
  }
  return { ok: true, mic: true, speechSynthesis, message: null };
}

export async function ensureMicPermission(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone permission was denied. Allow the mic, or type your answers.";
    }
    if (name === "NotFoundError") return "No microphone was found.";
    return "Could not open the microphone.";
  }
}
