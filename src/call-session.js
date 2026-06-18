import { chunkBuffer } from "./audio.js";
import { applyStateUpdates, initialState, openingLine } from "./conversation.js";
import {
  addTurn,
  getCall,
  getContact,
  setDoNotCall,
  updateCall
} from "./db.js";
import { DeepgramStream } from "./providers/deepgram.js";
import { decideReply } from "./providers/deepseek.js";
import { synthesizeForTwilio } from "./providers/minimax.js";
import WebSocket from "ws";

export class CallSession {
  constructor(socket) {
    this.socket = socket;
    this.streamSid = null;
    this.callId = null;
    this.call = null;
    this.contact = {};
    this.state = initialState();
    this.deepgram = null;
    this.activeController = null;
    this.pendingText = [];
    this.processing = false;
    this.startedAt = null;
    this.stopped = false;
  }

  async start(startMessage) {
    this.streamSid = startMessage.start.streamSid;
    this.callId = Number(
      startMessage.start.customParameters?.callId ||
        startMessage.start.customParameters?.callid
    );
    this.call = getCall(this.callId);
    this.contact = this.call?.contact_id ? getContact(this.call.contact_id) || {} : {};
    if (this.call?.state_json) {
      try {
        this.state = { ...initialState(), ...JSON.parse(this.call.state_json) };
      } catch {
        this.state = initialState();
      }
    }
    this.startedAt = new Date();
    updateCall(this.callId, {
      status: "in-progress",
      started_at: this.startedAt.toISOString()
    });
    this.deepgram = new DeepgramStream({
      onSpeechStarted: () => this.interrupt(),
      onFinalTranscript: (text) => this.enqueueCustomerText(text),
      onError: (error) => console.error("Deepgram error", error)
    });
    await this.deepgram.connect();
    await this.speak(openingLine(this.contact.name));
  }

  receiveMedia(payload) {
    this.deepgram?.send(Buffer.from(payload, "base64"));
  }

  enqueueCustomerText(text) {
    addTurn(this.callId, "customer", text);
    this.pendingText.push(text);
    void this.processQueue();
  }

  async processQueue() {
    if (this.processing || !this.pendingText.length) return;
    this.processing = true;
    const customerText = this.pendingText.splice(0).join(" ");
    this.activeController = new AbortController();
    try {
      const decision = await decideReply({
        customerText,
        state: this.state,
        contact: this.contact,
        signal: this.activeController.signal
      });
      this.state = applyStateUpdates(this.state, decision.stateUpdates);
      updateCall(this.callId, {
        state_json: JSON.stringify(this.state),
        outcome: decision.intent || ""
      });
      if (this.state.doNotCall && this.contact.id) setDoNotCall(this.contact.id, true);
      await this.speak(decision.replyVi, this.activeController.signal);
      if (decision.action === "end") {
        setTimeout(() => this.socket.close(), 1200);
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Conversation turn failed", error);
    } finally {
      this.activeController = null;
      this.processing = false;
      if (this.pendingText.length) void this.processQueue();
    }
  }

  interrupt() {
    if (this.activeController) this.activeController.abort();
    if (this.streamSid && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({ event: "clear", streamSid: this.streamSid })
      );
    }
  }

  async speak(text, signal) {
    if (!text) return;
    addTurn(this.callId, "agent", text);
    const audio = await synthesizeForTwilio(text, signal);
    if (!audio) {
      console.log(`[mock TTS][call ${this.callId}] ${text}`);
      return;
    }
    for (const chunk of chunkBuffer(audio)) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      this.socket.send(
        JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: chunk.toString("base64") }
        })
      );
    }
    this.socket.send(
      JSON.stringify({
        event: "mark",
        streamSid: this.streamSid,
        mark: { name: `reply-${Date.now()}` }
      })
    );
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.activeController?.abort();
    this.deepgram?.close();
    if (this.callId) {
      const ended = new Date();
      const started = this.startedAt || ended;
      const summary = [
        this.state.application ? `应用：${this.state.application}` : null,
        this.state.process ? `工艺：${this.state.process}` : null,
        this.state.hardnessShoreA ? `硬度：${this.state.hardnessShoreA} Shore A` : null,
        this.state.monthlyQuantityKg ? `月用量：${this.state.monthlyQuantityKg} kg` : null,
        this.state.priceRequested ? "客户询价" : null,
        this.state.sampleRequested ? "客户要样" : null,
        this.state.humanFollowupRequired ? "需要人工跟进" : null,
        this.state.doNotCall ? "禁止再次联系" : null
      ].filter(Boolean).join("；");
      updateCall(this.callId, {
        status: "completed",
        ended_at: ended.toISOString(),
        duration_seconds: Math.max(0, Math.round((ended - started) / 1000)),
        summary,
        state_json: JSON.stringify(this.state)
      });
    }
  }
}
