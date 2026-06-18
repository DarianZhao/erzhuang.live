import fs from "node:fs";
import path from "node:path";

function loadDotEnv(file = ".env") {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) return;
  for (const rawLine of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 8787),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  appMode: process.env.APP_MODE || "mock",
  companyName: process.env.COMPANY_NAME || "Darian Materials",
  agentName: process.env.AGENT_NAME || "Darian",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+84",
  maxCallMinutes: Number(process.env.MAX_CALL_MINUTES || 15),
  appUsername: process.env.APP_USERNAME || "",
  appPassword: process.env.APP_PASSWORD || "",
  dataDir: process.env.DATA_DIR || "./data",
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || ""
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || "",
    model: process.env.DEEPGRAM_MODEL || "nova-3"
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || "",
    voiceId: process.env.MINIMAX_VOICE_ID || "",
    model: process.env.MINIMAX_MODEL || "speech-2.8-turbo"
  }
};

export function readiness() {
  const checks = {
    publicUrl: Boolean(config.publicBaseUrl),
    twilio: Boolean(
      config.twilio.accountSid &&
        config.twilio.authToken &&
        config.twilio.fromNumber
    ),
    deepgram: Boolean(config.deepgram.apiKey),
    deepseek: Boolean(config.deepseek.apiKey),
    minimax: Boolean(config.minimax.apiKey && config.minimax.voiceId)
  };
  return {
    mode: config.appMode,
    checks,
    liveReady: Object.values(checks).every(Boolean)
  };
}
