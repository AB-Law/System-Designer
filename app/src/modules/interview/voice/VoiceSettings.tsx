import { useState } from "react";
import { getVoiceKey, setVoiceKey } from "./key";
import type { TtsProviderId, VoicePrefs } from "./types";

interface Props {
  prefs: VoicePrefs;
  onChange: (next: VoicePrefs) => void;
  speechSynthesis: boolean;
}

export function VoiceSettings({ prefs, onChange, speechSynthesis }: Props) {
  const [key, setKey] = useState(getVoiceKey);
  return (
    <details className="iv-voice-settings">
      <summary>Voice settings</summary>
      <div className="iv-voice-fields">
        <label className="iv-check">
          <input type="checkbox" checked={prefs.handsFree} onChange={(e) => onChange({ ...prefs, handsFree: e.target.checked })} />
          Hands-free (auto-send on silence, listen after the interviewer)
        </label>
        <label className="iv-check">
          <input
            type="checkbox"
            checked={prefs.speakInterviewer}
            disabled={!speechSynthesis}
            onChange={(e) => onChange({ ...prefs, speakInterviewer: e.target.checked })}
          />
          Speak interviewer replies
        </label>
        <label className="iv-field">
          OpenAI key for transcription <small>(optional)</small>
          <input
            type="password"
            value={key}
            placeholder="sk-…"
            autoComplete="off"
            onChange={(e) => {
              setKey(e.target.value);
              setVoiceKey(e.target.value);
            }}
          />
          <small className="muted">
            Saved in this browser only. Audio goes straight to api.openai.com with your key and never through our server. Leave blank to use
            the server&apos;s key, if it has one.
          </small>
        </label>
        <label className="iv-field">
          Voice engine
          <select
            value={prefs.ttsProvider}
            disabled={!speechSynthesis}
            onChange={(e) => onChange({ ...prefs, ttsProvider: e.target.value as TtsProviderId })}
          >
            <option value="native">Browser voice (default)</option>
            <option value="kokoro">Kokoro model (downloads on first use)</option>
          </select>
        </label>
        <label className="iv-field">
          Rate
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={prefs.rate}
            onChange={(e) => onChange({ ...prefs, rate: Number(e.target.value) })}
          />
        </label>
      </div>
    </details>
  );
}
