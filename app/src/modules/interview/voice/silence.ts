/** RMS silence / speech detection on a MediaStream. One place for threshold math. */

export interface SilenceOptions {
  /** RMS below this counts as silence (0–1). */
  threshold?: number;
  /** Continuous silence before firing (ms). */
  silenceMs?: number;
  /** Minimum speech before silence can fire (ms). */
  minSpeechMs?: number;
  onSilence: () => void;
  onSpeech?: () => void;
}

export interface SilenceMonitor {
  stop: () => void;
}

export function watchSilence(stream: MediaStream, options: SilenceOptions): SilenceMonitor {
  const threshold = options.threshold ?? 0.015;
  const silenceMs = options.silenceMs ?? 1400;
  const minSpeechMs = options.minSpeechMs ?? 400;

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);

  let speaking = false;
  let speechStarted = 0;
  let silentSince = 0;
  let stopped = false;
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(data);
    const rms = rootMeanSquare(data);
    const now = performance.now();
    if (rms >= threshold) {
      if (!speaking) {
        speaking = true;
        speechStarted = now;
        options.onSpeech?.();
      }
      silentSince = 0;
    } else if (speaking) {
      if (!silentSince) silentSince = now;
      if (now - speechStarted >= minSpeechMs && now - silentSince >= silenceMs) {
        speaking = false;
        silentSince = 0;
        options.onSilence();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
        void ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}

export function rootMeanSquare(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
