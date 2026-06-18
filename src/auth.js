import crypto from "node:crypto";
import { config } from "./config.js";

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function appAuthEnabled() {
  return Boolean(config.appUsername && config.appPassword);
}

export function isAuthorized(request) {
  if (!appAuthEnabled()) return config.appMode !== "live";
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return (
      safeEqual(decoded.slice(0, separator), config.appUsername) &&
      safeEqual(decoded.slice(separator + 1), config.appPassword)
    );
  } catch {
    return false;
  }
}

export function requestLogin(response) {
  response.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Erzhuang Call Console", charset="UTF-8"',
    "Cache-Control": "no-store"
  });
  response.end("需要登录才能访问电话系统。");
}
