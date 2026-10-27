/** Thin MediaRecorder wrapper. Caller owns the stream lifecycle via start/stop. */

export interface Recording {
  blob: Blob;
  mime: string;
}

export class MicRecorder {
  private media: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    this.chunks = [];
    this.media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    this.recorder = mime ? new MediaRecorder(this.media, { mimeType: mime }) : new MediaRecorder(this.media);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);
  }

  /** The live stream, for silence / barge-in analysers. Null when not recording. */
  stream(): MediaStream | null {
    return this.media;
  }

  stop(): Promise<Recording> {
    const recorder = this.recorder;
    const media = this.media;
    this.recorder = null;
    this.media = null;
    if (!recorder) return Promise.resolve({ blob: new Blob(), mime: "audio/webm" });

    return new Promise((resolve) => {
      recorder.onstop = () => {
        media?.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || "audio/webm";
        resolve({ blob: new Blob(this.chunks, { type: mime }), mime });
        this.chunks = [];
      };
      if (recorder.state !== "inactive") recorder.stop();
      else {
        media?.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" }), mime: recorder.mimeType || "audio/webm" });
      }
    });
  }

  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* already stopped */
    }
    this.media?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.media = null;
    this.chunks = [];
  }
}

function pickMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
}
