import { Button } from "../../../ui/Button";
import { PHASE_LABEL, type VoicePhase } from "./types";

interface Props {
  phase: VoicePhase;
  canAnswer: boolean;
  micOk: boolean;
  error: string | null;
  handsFree: boolean;
  onStart: () => void;
  onStop: () => void;
  onTypeInstead: () => void;
  onClearError: () => void;
}

export function VoiceControls({ phase, canAnswer, micOk, error, handsFree, onStart, onStop, onTypeInstead, onClearError }: Props) {
  const listening = phase === "listening";
  const busyVoice = phase === "thinking" || phase === "speaking";
  const micDisabled = !micOk || !canAnswer || busyVoice;

  return (
    <div className="iv-voice">
      <div className="iv-voice-row">
        <Button
          type="button"
          size="small"
          variant={listening ? "primary" : "ghost"}
          disabled={micDisabled && !listening}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording" : "Start recording"}
          onClick={() => (listening ? onStop() : onStart())}
        >
          {listening ? "Stop" : "Mic"}
        </Button>
        <span className="iv-voice-phase" aria-live="polite">
          {PHASE_LABEL[phase]}
          {handsFree && phase !== "idle" ? " · hands-free" : ""}
        </span>
        {(listening || busyVoice || error) && (
          <Button type="button" size="small" variant="ghost" onClick={onTypeInstead}>
            Type instead
          </Button>
        )}
      </div>
      {error && (
        <p className="iv-warn" role="alert">
          {error}{" "}
          <Button type="button" size="small" onClick={onClearError}>
            Dismiss
          </Button>
        </p>
      )}
    </div>
  );
}
