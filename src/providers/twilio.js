import { config } from "../config.js";

export function normalizeVietnamPhone(input) {
  const cleaned = String(input || "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+84")) return cleaned;
  if (cleaned.startsWith("84")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+84${cleaned.slice(1)}`;
  return `${config.defaultCountryCode}${cleaned}`;
}

export async function startOutboundCall({ phone, callId }) {
  if (!config.publicBaseUrl) throw new Error("PUBLIC_BASE_URL is required for live calls");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Calls.json`;
  const form = new URLSearchParams({
    To: normalizeVietnamPhone(phone),
    From: config.twilio.fromNumber,
    Url: `${config.publicBaseUrl}/twilio/voice?callId=${callId}`,
    StatusCallback: `${config.publicBaseUrl}/twilio/status?callId=${callId}`,
    StatusCallbackEvent: "initiated ringing answered completed",
    StatusCallbackMethod: "POST",
    MachineDetection: "Enable"
  });
  const auth = Buffer.from(
    `${config.twilio.accountSid}:${config.twilio.authToken}`
  ).toString("base64");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  if (!response.ok) {
    throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export function twimlForCall(callId) {
  const websocketUrl = config.publicBaseUrl
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${websocketUrl}/twilio/media">
      <Parameter name="callId" value="${callId}" />
    </Stream>
  </Connect>
</Response>`;
}
