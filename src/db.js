import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const dataDirectory = path.resolve(config.dataDir);
fs.mkdirSync(dataDirectory, { recursive: true });

export const db = new DatabaseSync(path.join(dataDirectory, "calls.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    phone TEXT NOT NULL UNIQUE,
    source_url TEXT DEFAULT '',
    contact_permission TEXT NOT NULL DEFAULT 'unknown',
    do_not_call INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER,
    phone TEXT NOT NULL,
    provider_call_sid TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    mode TEXT NOT NULL DEFAULT 'mock',
    started_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    outcome TEXT DEFAULT '',
    state_json TEXT DEFAULT '{}',
    FOREIGN KEY(contact_id) REFERENCES contacts(id)
  );
  CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(call_id) REFERENCES calls(id)
  );
`);

export function listContacts() {
  return db.prepare("SELECT * FROM contacts ORDER BY id DESC").all();
}

export function createContact(input) {
  const result = db
    .prepare(`
      INSERT INTO contacts
        (name, company, phone, source_url, contact_permission, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.name,
      input.company || "",
      input.phone,
      input.sourceUrl || "",
      input.contactPermission || "unknown",
      input.notes || ""
    );
  return db.prepare("SELECT * FROM contacts WHERE id = ?").get(result.lastInsertRowid);
}

export function getContact(id) {
  return db.prepare("SELECT * FROM contacts WHERE id = ?").get(id);
}

export function setDoNotCall(id, value = true) {
  db.prepare("UPDATE contacts SET do_not_call = ? WHERE id = ?").run(value ? 1 : 0, id);
}

export function createCall({ contactId = null, phone, mode }) {
  const result = db
    .prepare("INSERT INTO calls (contact_id, phone, mode) VALUES (?, ?, ?)")
    .run(contactId, phone, mode);
  return getCall(Number(result.lastInsertRowid));
}

export function getCall(id) {
  return db.prepare("SELECT * FROM calls WHERE id = ?").get(id);
}

export function updateCall(id, fields) {
  const allowed = new Set([
    "provider_call_sid",
    "status",
    "started_at",
    "ended_at",
    "duration_seconds",
    "summary",
    "outcome",
    "state_json"
  ]);
  const entries = Object.entries(fields).filter(([key]) => allowed.has(key));
  if (!entries.length) return getCall(id);
  const sql = `UPDATE calls SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...entries.map(([, value]) => value), id);
  return getCall(id);
}

export function addTurn(callId, speaker, text) {
  db.prepare("INSERT INTO turns (call_id, speaker, text) VALUES (?, ?, ?)").run(
    callId,
    speaker,
    text
  );
}

export function getTurns(callId) {
  return db
    .prepare("SELECT * FROM turns WHERE call_id = ? ORDER BY id ASC")
    .all(callId);
}

export function listCalls() {
  return db
    .prepare(`
      SELECT calls.*, contacts.name AS contact_name, contacts.company AS contact_company
      FROM calls
      LEFT JOIN contacts ON contacts.id = calls.contact_id
      ORDER BY calls.id DESC
      LIMIT 100
    `)
    .all();
}
