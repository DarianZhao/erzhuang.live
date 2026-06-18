import WebSocket from "ws";
import { config } from "../config.js";

export class DeepgramStream {
  constructor({ onFinalTranscript, onSpeechStarted, onError }) {
    this.onFinalTranscript = onFinalTranscript;
    this.onSpeechStarted = onSpeechStarted;
    this.onError = onError;
    this.socket = null;
    this.finalSegments = [];
    this.flushTimer = null;
  }

  async connect() {
    if (!config.deepgram.apiKey) return;
    const query = new URLSearchParams({
      model: config.deepgram.model,
      language: "vi",
      encoding: "mulaw",
      sample_rate: "8000",
      channels: "1",
      smart_format: "true",
      interim_results: "true",
      endpointing: "300",
      utterance_end_ms: "1000",
      vad_events: "true"
    });
    this.socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, {
      headers: { Authorization: `Token ${config.deepgram.apiKey}` }
    });
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "SpeechStarted") this.onSpeechStarted?.();
        if (message.type === "Results") {
          const transcript = message.channel?.alternatives?.[0]?.transcript?.trim();
          if (transcript && message.is_final) {
            this.finalSegments.push(transcript);
            clearTimeout(this.flushTimer);
            if (message.speech_final) {
              this.flush();
            } else {
              this.flushTimer = setTimeout(() => this.flush(), 900);
            }
          }
        }
        if (message.type === "UtteranceEnd") this.flush();
      } catch (error) {
        this.onError?.(error);
      }
    });
    this.socket.on("error", (error) => this.onError?.(error));
  }

  send(audio) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(audio);
  }

  flush() {
    clearTimeout(this.flushTimer);
    const transcript = this.finalSegments.splice(0).join(" ").trim();
    if (transcript) this.onFinalTranscript?.(transcript);
  }

  close() {
    clearTimeout(this.flushTimer);
    this.flush();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
      this.socket.close();
    }
  }
}
