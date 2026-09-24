import { MAX_AUDIO_BYTES, MAX_SECONDS, VoiceError } from "./schema.ts";

export type Recording = { audio: Blob; recordedAt: string; duration: number };
/** Holds audio in memory only. Cancellation also handles late permission resolution. */
export class VoiceRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private bytes = 0;
  private generation = 0;
  private started = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private rejectStop?: (error: Error) => void;

  async start(onLimit: () => void, onError: (code: string) => void) {
    this.cancel();
    const generation = this.generation;
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new VoiceError("MIC_UNSUPPORTED");
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new VoiceError("MIC_UNSUPPORTED");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (error) { throw new VoiceError(error instanceof DOMException && error.name === "NotAllowedError" ? "MIC_DENIED" : "MIC_UNAVAILABLE"); }
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw new VoiceError("CANCELLED"); }
    this.stream = stream;
    try {
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        this.bytes += event.data.size;
        if (this.bytes > MAX_AUDIO_BYTES) { this.cancel(); onError("BODY_TOO_LARGE"); return; }
        this.chunks.push(event.data);
      };
      recorder.onerror = () => { this.cancel(); onError("MIC_UNAVAILABLE"); };
      recorder.onstop = () => { this.cancel(); onError("RECORDING_INTERRUPTED"); };
      stream.getTracks().forEach(track => { track.onended = () => { this.cancel(); onError("RECORDING_INTERRUPTED"); }; });
      this.started = Date.now();
      recorder.start(1000);
      this.timer = setTimeout(onLimit, MAX_SECONDS * 1000);
    } catch { this.cancel(); throw new VoiceError("MIC_UNAVAILABLE"); }
  }

  stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.reject(new VoiceError("NO_AUDIO"));
    clearTimeout(this.timer);
    const duration = (Date.now() - this.started) / 1000;
    const recordedAt = new Date(this.started).toISOString();
    return new Promise((resolve, reject) => {
      this.rejectStop = reject;
      recorder.onstop = () => {
        const audio = new Blob(this.chunks, { type: recorder.mimeType });
        this.rejectStop = undefined;
        this.cancel();
        if (!audio.size || duration <= 0) reject(new VoiceError("NO_AUDIO"));
        else if (duration > MAX_SECONDS + 2) reject(new VoiceError("RECORDING_TOO_LONG"));
        else resolve({ audio, recordedAt, duration });
      };
      // Stop the microphone immediately, before waiting on asynchronous encoding.
      this.stream?.getTracks().forEach(track => { track.onended = null; });
      try { recorder.stop(); }
      catch { this.cancel(); reject(new VoiceError("NO_AUDIO")); }
      this.stream?.getTracks().forEach(track => track.stop());
    });
  }

  cancel() {
    this.generation++;
    clearTimeout(this.timer);
    if (this.recorder) {
      this.recorder.ondataavailable = null; this.recorder.onerror = null; this.recorder.onstop = null;
      if (this.recorder.state !== "inactive") { try { this.recorder.stop(); } catch { /* Already interrupted. */ } }
    }
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = undefined; this.recorder = undefined; this.chunks = []; this.bytes = 0;
    this.rejectStop?.(new VoiceError("CANCELLED")); this.rejectStop = undefined;
  }
}
