import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";

const audioPath = process.argv[2];
const requestedVoiceId =
  process.argv[3] ||
  process.env.MINIMAX_NEW_VOICE_ID ||
  `DarianVietnam${Date.now()}`;

if (!audioPath) {
  console.error("Usage: npm run clone-voice -- /absolute/path/to/voice.wav [VoiceId]");
  process.exit(1);
}
if (!config.minimax.apiKey) {
  console.error("MINIMAX_API_KEY is missing in .env");
  process.exit(1);
}

const fullPath = path.resolve(audioPath);
if (!fs.existsSync(fullPath)) {
  console.error(`Audio file not found: ${fullPath}`);
  process.exit(1);
}

const extension = path.extname(fullPath).toLowerCase();
if (![".wav", ".mp3", ".m4a"].includes(extension)) {
  console.error("MiniMax voice cloning accepts WAV, MP3 or M4A");
  process.exit(1);
}

const form = new FormData();
form.set("purpose", "voice_clone");
form.set(
  "file",
  new Blob([fs.readFileSync(fullPath)]),
  path.basename(fullPath)
);

console.log("Uploading voice sample...");
const uploadResponse = await fetch("https://api.minimax.io/v1/files/upload", {
  method: "POST",
  headers: { Authorization: `Bearer ${config.minimax.apiKey}` },
  body: form
});
if (!uploadResponse.ok) {
  throw new Error(`MiniMax upload ${uploadResponse.status}: ${await uploadResponse.text()}`);
}
const uploadPayload = await uploadResponse.json();
const fileId = uploadPayload.file?.file_id;
if (!fileId) throw new Error(`MiniMax did not return file_id: ${JSON.stringify(uploadPayload)}`);

console.log(`Cloning voice as ${requestedVoiceId}...`);
const cloneResponse = await fetch("https://api.minimax.io/v1/voice_clone", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.minimax.apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    file_id: fileId,
    voice_id: requestedVoiceId,
    text: "Xin chào, tôi là trợ lý AI của Darian. Rất vui được trao đổi với anh chị.",
    model: config.minimax.model,
    language_boost: "Vietnamese",
    need_noise_reduction: true,
    need_volume_normalization: true,
    aigc_watermark: true
  })
});
if (!cloneResponse.ok) {
  throw new Error(`MiniMax clone ${cloneResponse.status}: ${await cloneResponse.text()}`);
}
const clonePayload = await cloneResponse.json();
if (clonePayload.base_resp?.status_code !== 0) {
  throw new Error(`MiniMax clone failed: ${JSON.stringify(clonePayload.base_resp)}`);
}

console.log("");
console.log("Voice clone created successfully.");
console.log(`Set this in .env: MINIMAX_VOICE_ID=${requestedVoiceId}`);
if (clonePayload.demo_audio) console.log(`Preview: ${clonePayload.demo_audio}`);
