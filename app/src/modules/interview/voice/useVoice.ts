import { useEffect, useReducer, useRef, useState } from "react";
import { errText } from "../../../shared/async";
import { checkCapabilities, ensureMicPermission } from "./capabilities";
import { initialVoice, voiceReducer } from "./machine";
import { loadPrefs, savePrefs } from "./prefs";
import { MicRecorder } from "./recorder";
import { watchSilence, type SilenceMonitor } from "./silence";
import { transcribeBlob } from "./stt";
import { TtsRouter } from "./tts/router";
import type { VoicePrefs } from "./types";

export interface VoiceChatSnapshot {
  busy: boolean;
  finished: boolean;
  canAnswer: boolean;
  /** Latest completed interviewer turn text (spoken once when it appears). */
  lastInterviewerText: string;
  streaming: string;
}

interface Options {
  enabled: boolean;
  sessionId: number;
  chat: VoiceChatSnapshot;
  answer: (text: string) => void;
  onDraft: (text: string) => void;
}

export function useVoice({ enabled, sessionId, chat, answer, onDraft }: Options) {
  const [state, dispatch] = useReducer(voiceReducer, undefined, initialVoice);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [cap] = useState(checkCapabilities);
  const recorder = useRef(new MicRecorder());
  const silence = useRef<SilenceMonitor | null>(null);
  const barge = useRef<SilenceMonitor | null>(null);
  const tts = useRef(new TtsRouter());
  const abortSpeak = useRef<AbortController | null>(null);
  const spokenFor = useRef("");
  const handsFree = prefs.handsFree;

  const setPrefs = (next: VoicePrefs) => {
    setPrefsState(next);
    savePrefs(next);
    tts.current.setPreferred(next.ttsProvider);
  };

  const stopMonitors = () => {
    silence.current?.stop();
    silence.current = null;
    barge.current?.stop();
    barge.current = null;
  };

  const cancelSpeech = () => {
    abortSpeak.current?.abort();
    abortSpeak.current = null;
    tts.current.cancel();
  };

  const finishListening = async (autoSend: boolean) => {
    stopMonitors();
    try {
      const { blob } = await recorder.current.stop();
      const text = await transcribeBlob(sessionId, blob);
      if (autoSend) {
        dispatch({ type: "submit", text });
        answer(text);
      } else {
        onDraft(text);
        dispatch({ type: "draft", text });
      }
    } catch (e) {
      dispatch({ type: "transcribe_fail", message: errText(e) });
    }
  };

  const startListening = async () => {
    if (!enabled || !cap.ok || !chat.canAnswer || chat.busy || chat.finished) return;
    const denied = await ensureMicPermission();
    if (denied) {
      dispatch({ type: "transcribe_fail", message: denied });
      return;
    }
    cancelSpeech();
    try {
      await recorder.current.start();
      dispatch({ type: "start_listen" });
      const stream = recorder.current.stream();
      if (stream && handsFree) {
        silence.current = watchSilence(stream, {
          onSilence: () => void finishListening(true),
        });
      }
    } catch (e) {
      recorder.current.cancel();
      dispatch({ type: "transcribe_fail", message: errText(e) });
    }
  };

  const stopListening = () => {
    if (state.phase !== "listening") return;
    void finishListening(handsFree);
  };

  const typeInstead = () => {
    stopMonitors();
    recorder.current.cancel();
    cancelSpeech();
    dispatch({ type: "fallback_type" });
  };

  // Effects below call the latest version of these without restarting when they change
  const latest = useRef({ cancelSpeech, startListening });
  useEffect(() => {
    latest.current = { cancelSpeech, startListening };
  });

  // Sync chat busy → thinking / idle
  useEffect(() => {
    if (!enabled) return;
    if (chat.busy) dispatch({ type: "chat_busy" });
    else if (state.phase === "thinking" && !prefs.speakInterviewer) dispatch({ type: "chat_idle" });
  }, [enabled, chat.busy, prefs.speakInterviewer, state.phase]);

  // Speak interviewer turns once they complete
  useEffect(() => {
    if (!enabled) return;
    const text = chat.lastInterviewerText.trim();
    if (!prefs.speakInterviewer || !text || chat.busy || chat.finished) return;
    if (text === spokenFor.current) return;
    spokenFor.current = text;

    let cancelled = false;
    const run = async () => {
      latest.current.cancelSpeech();
      const ac = new AbortController();
      abortSpeak.current = ac;
      dispatch({ type: "speak" });
      try {
        tts.current.setPreferred(prefs.ttsProvider);
        await tts.current.speak(text, {
          preferredVoiceName: prefs.preferredVoiceName || undefined,
          rate: prefs.rate,
          signal: ac.signal,
        });
        if (cancelled) return;
        dispatch({ type: "spoke" });
        if (handsFree && chat.canAnswer) void latest.current.startListening();
      } catch (e) {
        if (ac.signal.aborted || cancelled) return;
        dispatch({ type: "transcribe_fail", message: errText(e) });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, chat.lastInterviewerText, chat.busy, chat.finished, chat.canAnswer, prefs, handsFree]);

  // Barge-in while speaking: open a short mic watch for speech energy
  useEffect(() => {
    if (!enabled || state.phase !== "speaking" || !handsFree) return;
    let alive = true;
    let local: SilenceMonitor | null = null;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        local = watchSilence(stream, {
          threshold: 0.04,
          silenceMs: 999_999,
          minSpeechMs: 120,
          onSpeech: () => {
            latest.current.cancelSpeech();
            stream.getTracks().forEach((t) => t.stop());
            local?.stop();
            dispatch({ type: "barge_in" });
            void latest.current.startListening();
          },
          onSilence: () => {},
        });
        barge.current = local;
      } catch {
        /* barge-in is best-effort */
      }
    })();
    return () => {
      alive = false;
      local?.stop();
      barge.current = null;
    };
  }, [enabled, state.phase, handsFree]);

  useEffect(
    () => () => {
      stopMonitors();
      recorder.current.cancel();
      latest.current.cancelSpeech();
      tts.current.dispose();
    },
    [],
  );

  return {
    state,
    prefs,
    setPrefs,
    capability: cap,
    startListening,
    stopListening,
    typeInstead,
    clearError: () => dispatch({ type: "clear_error" }),
  };
}
