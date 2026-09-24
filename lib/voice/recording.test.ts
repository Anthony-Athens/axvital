import test from "node:test";
import assert from "node:assert/strict";
import { VoiceRecorder } from "./recording.ts";

test("capture releases tracks on stop/cancel, enforces limit, handles late permission and recorder failure", async t => {
  let stops = 0, clock = 1000, limit = 0, code = "";
  const tracks = [{ stop: () => { stops++; }, onended: null as null | (() => void) }];
  const stream = { getTracks: () => tracks };
  class FakeRecorder {
    static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
    state = "inactive"; mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null; onerror: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["audio"]) }); this.onstop?.(); }); }
  }
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const recorder = new VoiceRecorder();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  Object.assign(globalThis, { isSecureContext: true, MediaRecorder: FakeRecorder });
  t.mock.method(Date, "now", () => clock);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await recorder.start(() => limit++, value => { code = value; });
    t.mock.timers.tick(75000); assert.equal(limit, 1);
    clock = 5000; const recording = await recorder.stop();
    assert.equal(recording.duration, 4); assert.equal(recording.audio.size, 5); assert.ok(stops > 0);
    await recorder.start(() => {}, () => {}); const before = stops; recorder.cancel(); assert.ok(stops > before);
    let release!: (value: typeof stream) => void;
    Object.assign(navigator.mediaDevices, { getUserMedia: () => new Promise(resolve => { release = resolve; }) });
    const pending = recorder.start(() => {}, () => {}); recorder.cancel(); const prior = stops; release(stream);
    await assert.rejects(pending, /CANCELLED/); assert.ok(stops > prior);
    Object.assign(navigator.mediaDevices, { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } });
    await assert.rejects(recorder.start(() => {}, () => {}), /MIC_DENIED/);
    Object.assign(navigator.mediaDevices, { getUserMedia: async () => stream });
    await recorder.start(() => {}, value => { code = value; }); tracks[0].onended?.(); assert.equal(code, "RECORDING_INTERRUPTED");
    Object.assign(globalThis, { isSecureContext: false });
    await assert.rejects(recorder.start(() => {}, () => {}), /MIC_UNSUPPORTED/);
  } finally {
    recorder.cancel();
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    Reflect.deleteProperty(globalThis, "MediaRecorder"); Reflect.deleteProperty(globalThis, "isSecureContext");
  }
});
