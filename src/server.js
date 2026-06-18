import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { config, readiness } from "./config.js";
import {
  addTurn,
  createCall,
  createContact,
  getCall,
  getContact,
  getTurns,
  listCalls,
  listContacts,
  setDoNotCall,
  updateCall
} from "./db.js";
import { applyStateUpdates, initialState, openingLine } from "./conversation.js";
import { decideReply } from "./providers/deepseek.js";
import { startOutboundCall, twimlForCall } from "./providers/twilio.js";
import { CallSession } from "./call-session.js";
import { validateTwilioSignature } from "./twilio-security.js";
import { isAuthorized, requestLogin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(__dirname, "../public");

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function text(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const contentType = request.headers["content-type"] || "";
  if (contentType.includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function serveStatic(urlPath, response) {
  const relative = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const safePath = path.normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(publicDirectory, safePath);
  if (!fullPath.startsWith(publicDirectory) || !fs.existsSync(fullPath)) return false;
  const extension = path.extname(fullPath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  text(response, 200, fs.readFileSync(fullPath), types[extension] || "application/octet-stream");
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { ok: true, mode: config.appMode });
    }
    const isTwilioEndpoint = url.pathname.startsWith("/twilio/");
    if (!isTwilioEndpoint && !isAuthorized(request)) {
      return requestLogin(response);
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return json(response, 200, readiness());
    }
    if (request.method === "GET" && url.pathname === "/api/contacts") {
      return json(response, 200, listContacts());
    }
    if (request.method === "POST" && url.pathname === "/api/contacts") {
      const body = await readBody(request);
      if (!body.name || !body.phone) return json(response, 400, { error: "name and phone are required" });
      return json(response, 201, createContact(body));
    }
    if (request.method === "GET" && url.pathname === "/api/calls") {
      return json(response, 200, listCalls());
    }
    const callMatch = url.pathname.match(/^\/api\/calls\/(\d+)$/);
    if (request.method === "GET" && callMatch) {
      const call = getCall(Number(callMatch[1]));
      if (!call) return json(response, 404, { error: "call not found" });
      return json(response, 200, { ...call, turns: getTurns(call.id) });
    }
    if (request.method === "POST" && url.pathname === "/api/calls") {
      const body = await readBody(request);
      const contact = getContact(Number(body.contactId));
      if (!contact) return json(response, 404, { error: "contact not found" });
      if (contact.do_not_call) return json(response, 409, { error: "contact is on the do-not-call list" });
      if (contact.contact_permission === "denied") {
        return json(response, 409, { error: "contact permission is denied" });
      }
      const mode = body.mode || config.appMode;
      const call = createCall({ contactId: contact.id, phone: contact.phone, mode });
      if (mode === "live") {
        const providerCall = await startOutboundCall({ phone: contact.phone, callId: call.id });
        updateCall(call.id, {
          provider_call_sid: providerCall.sid,
          status: providerCall.status || "queued"
        });
      } else {
        updateCall(call.id, {
          status: "in-progress",
          started_at: new Date().toISOString(),
          state_json: JSON.stringify(initialState())
        });
        addTurn(call.id, "agent", openingLine(contact.name));
      }
      return json(response, 201, getCall(call.id));
    }
    const simulateMatch = url.pathname.match(/^\/api\/calls\/(\d+)\/simulate$/);
    if (request.method === "POST" && simulateMatch) {
      const callId = Number(simulateMatch[1]);
      const call = getCall(callId);
      if (!call) return json(response, 404, { error: "call not found" });
      const body = await readBody(request);
      if (!body.text) return json(response, 400, { error: "text is required" });
      const contact = call.contact_id ? getContact(call.contact_id) : {};
      const state = { ...initialState(), ...JSON.parse(call.state_json || "{}") };
      addTurn(callId, "customer", body.text);
      const decision = await decideReply({ customerText: body.text, state, contact });
      const nextState = applyStateUpdates(state, decision.stateUpdates);
      addTurn(callId, "agent", decision.replyVi);
      const endedAt = decision.action === "end" ? new Date() : null;
      const startedAt = call.started_at ? new Date(call.started_at) : endedAt;
      updateCall(callId, {
        state_json: JSON.stringify(nextState),
        outcome: decision.intent,
        status: decision.action === "end" ? "completed" : "in-progress",
        ended_at: endedAt?.toISOString() || null,
        duration_seconds:
          endedAt && startedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : 0,
        summary: [
          nextState.priceRequested ? "客户询价" : null,
          nextState.sampleRequested ? "客户要样" : null,
          nextState.humanFollowupRequired ? "需要人工跟进" : null,
          nextState.doNotCall ? "禁止再次联系" : null
        ].filter(Boolean).join("；")
      });
      if (nextState.doNotCall && contact?.id) setDoNotCall(contact.id, true);
      return json(response, 200, {
        decision,
        state: nextState,
        turns: getTurns(callId)
      });
    }
    if (request.method === "POST" && url.pathname === "/twilio/voice") {
      const body = await readBody(request);
      const signatureUrl = `${config.publicBaseUrl}${url.pathname}${url.search}`;
      if (
        !validateTwilioSignature({
          signature: request.headers["x-twilio-signature"],
          url: signatureUrl,
          params: body
        })
      ) {
        return json(response, 403, { error: "invalid Twilio signature" });
      }
      const callId = Number(url.searchParams.get("callId"));
      if (body.CallSid) updateCall(callId, { provider_call_sid: body.CallSid });
      return text(response, 200, twimlForCall(callId), "text/xml; charset=utf-8");
    }
    if (request.method === "POST" && url.pathname === "/twilio/status") {
      const body = await readBody(request);
      const signatureUrl = `${config.publicBaseUrl}${url.pathname}${url.search}`;
      if (
        !validateTwilioSignature({
          signature: request.headers["x-twilio-signature"],
          url: signatureUrl,
          params: body
        })
      ) {
        return json(response, 403, { error: "invalid Twilio signature" });
      }
      const callId = Number(url.searchParams.get("callId"));
      const fields = { status: body.CallStatus || "unknown" };
      if (body.CallDuration) fields.duration_seconds = Number(body.CallDuration);
      if (body.CallStatus === "completed") fields.ended_at = new Date().toISOString();
      updateCall(callId, fields);
      return text(response, 204, "");
    }
    if (request.method === "GET" && serveStatic(url.pathname, response)) return;
    json(response, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: error.message });
  }
});

const websocketServer = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/twilio/media") {
    socket.destroy();
    return;
  }
  const signatureUrl = `${config.publicBaseUrl
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:")}${url.pathname}${url.search}`;
  if (
    !validateTwilioSignature({
      signature: request.headers["x-twilio-signature"],
      url: signatureUrl
    })
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit("connection", websocket, request);
  });
});

websocketServer.on("connection", (socket) => {
  const session = new CallSession(socket);
  socket.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.event === "start") await session.start(message);
      if (message.event === "media") session.receiveMedia(message.media.payload);
      if (message.event === "stop") session.stop();
    } catch (error) {
      console.error("Twilio stream message failed", error);
      socket.close();
    }
  });
  socket.on("close", () => session.stop());
  socket.on("error", (error) => console.error("Twilio WebSocket error", error));
});

server.listen(config.port, () => {
  console.log(`Vietnamese AI phone agent running at http://localhost:${config.port}`);
  console.log(`Mode: ${config.appMode}; live ready: ${readiness().liveReady}`);
});
