import type { SupabaseClient } from "@supabase/supabase-js";
import { guardWithClient } from "../api/boundary.ts";
import { ApiError } from "../api/validation.ts";
import { MAX_AUDIO_BYTES, MAX_SECONDS, VoiceError, type VoiceCandidate } from "./schema.ts";

type Processor = (audio: File, context: { now: Date; timeZone: string; signal: AbortSignal }) => Promise<{ candidates: VoiceCandidate[] }>;
export async function readVoiceUpload(request: Request, now = new Date()) {
  const limit = MAX_AUDIO_BYTES + 8192;
  if (Number(request.headers.get("content-length")) > limit) throw new ApiError(413, "BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "NO_AUDIO");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new ApiError(413, "BODY_TOO_LARGE"); }
      chunks.push(new Uint8Array(value));
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(new Blob(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new ApiError(400, "INVALID_AUDIO"); }
  for (const key of form.keys()) if (!["audio", "timeZone", "recordedAt", "duration"].includes(key) || form.getAll(key).length !== 1) throw new ApiError(400, "INVALID_REQUEST");
  const audio = form.get("audio"), zone = form.get("timeZone"), recordedAt = form.get("recordedAt"), duration = form.get("duration");
  if (!(audio instanceof File) || !audio.size) throw new ApiError(400, "NO_AUDIO");
  if (audio.size > MAX_AUDIO_BYTES) throw new ApiError(413, "BODY_TOO_LARGE");
  const mime = audio.type.split(";")[0];
  if (!["audio/webm", "audio/mp4"].includes(mime)) throw new ApiError(415, "UNSUPPORTED_AUDIO");
  const head = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
  if (mime === "audio/webm" ? ![0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => head[i] === byte) : String.fromCharCode(...head.slice(4, 8)) !== "ftyp") throw new ApiError(400, "INVALID_AUDIO");
  if (typeof duration !== "string" || !duration.trim() || !Number.isFinite(Number(duration)) || Number(duration) <= 0 || Number(duration) > MAX_SECONDS + 2) throw new ApiError(400, "RECORDING_TOO_LONG");
  if (typeof zone !== "string" || zone.length > 100 || typeof recordedAt !== "string") throw new ApiError(400, "INVALID_REQUEST");
  const instant = new Date(recordedAt);
  if (!Number.isFinite(instant.getTime()) || Math.abs(now.getTime() - instant.getTime()) > 10 * 60000) throw new ApiError(400, "INVALID_REQUEST");
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { throw new ApiError(400, "INVALID_REQUEST"); }
  return { audio, now: instant, timeZone: zone };
}

export function voiceParseApi(createClient: () => Promise<SupabaseClient>, process: Processor) {
  return guardWithClient("voice-log/parse", async request => {
    const upload = await readVoiceUpload(request);
    try { return Response.json(await process(upload.audio, { now: upload.now, timeZone: upload.timeZone, signal: request.signal })); }
    catch (error) {
      const known = ["VOICE_UNAVAILABLE", "TRANSCRIPTION_FAILED", "EXTRACTION_FAILED", "INVALID_AI_RESPONSE", "NO_SPEECH", "NO_EVENTS", "RECORDING_TOO_LONG"];
      if (error instanceof VoiceError && known.includes(error.message)) throw new ApiError(error.message === "VOICE_UNAVAILABLE" ? 503 : 422, error.message);
      throw new ApiError(503, "VOICE_PROCESSING_FAILED");
    }
  }, createClient);
}
