import { config } from "../config.js";
import { wavToTwilioMuLaw } from "../audio.js";

export async function synthesizeForTwilio(text, signal) {
  if (!config.minimax.apiKey || !config.minimax.voiceId) return null;
  const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.minimax.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.minimax.model,
      text,
      stream: false,
      language_boost: "Vietnamese",
      output_format: "hex",
      voice_setting: {
        voice_id: config.minimax.voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "wav",
        channel: 1
      }
    })
  });
  if (!response.ok) {
    throw new Error(`MiniMax ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.base_resp?.status_code !== 0 || !payload.data?.audio) {
    throw new Error(`MiniMax synthesis failed: ${JSON.stringify(payload.base_resp)}`);
  }
  return wavToTwilioMuLaw(Buffer.from(payload.data.audio, "hex"));
}
