import crypto from "node:crypto";
import { config } from "./config.js";

export function validateTwilioSignature({ signature, url, params = {} }) {
  if (!config.twilio.authToken) return config.appMode !== "live";
  if (!signature || !url) return false;
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");
  const expected = crypto
    .createHmac("sha1", config.twilio.authToken)
    .update(payload, "utf8")
    .digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
