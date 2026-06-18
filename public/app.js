let activeCallId = null;
let systemStatus = null;

const statusElement = document.querySelector("#status");
const contactsElement = document.querySelector("#contacts");
const callsElement = document.querySelector("#calls");
const transcriptElement = document.querySelector("#transcript");
const callTitle = document.querySelector("#call-title");
const callState = document.querySelector("#call-state");
const simulateForm = document.querySelector("#simulate-form");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function speakVietnamese(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

async function loadStatus() {
  systemStatus = await api("/api/status");
  const readyCount = Object.values(systemStatus.checks).filter(Boolean).length;
  statusElement.textContent = systemStatus.liveReady
    ? "LIVE 已就绪"
    : `模拟模式 · 实时组件 ${readyCount}/5`;
  statusElement.classList.toggle("ready", systemStatus.liveReady);
}

async function loadContacts() {
  const contacts = await api("/api/contacts");
  contactsElement.innerHTML = contacts.length
    ? contacts.map((contact) => `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(contact.name)}</strong>
          <small>${escapeHtml(contact.company || "未填写公司")} · ${escapeHtml(contact.phone)}</small>
          <small>许可：${escapeHtml(contact.contact_permission)}${contact.do_not_call ? ' · <span class="danger">禁止呼叫</span>' : ""}</small>
        </div>
        <div class="actions">
          <button data-call="${contact.id}" data-mode="mock" ${contact.do_not_call ? "disabled" : ""}>模拟通话</button>
          <button class="live" data-call="${contact.id}" data-mode="live" ${!systemStatus?.liveReady || contact.do_not_call ? "disabled" : ""}>真实拨号</button>
        </div>
      </div>
    `).join("")
    : '<p class="empty">先添加一个越南客户。</p>';
}

async function loadCalls() {
  const calls = await api("/api/calls");
  callsElement.innerHTML = calls.length
    ? calls.map((call) => `
      <div class="list-item" data-open-call="${call.id}">
        <div>
          <strong>${escapeHtml(call.contact_name || call.phone)}</strong>
          <small>#${call.id} · ${escapeHtml(call.mode)} · ${escapeHtml(call.status)}</small>
        </div>
        <button class="secondary" data-open-call="${call.id}">查看</button>
      </div>
    `).join("")
    : '<p class="empty">暂无通话。</p>';
}

function renderTurns(turns) {
  transcriptElement.innerHTML = turns.length
    ? turns.map((turn) => `
      <div class="bubble ${turn.speaker}">
        <span>${turn.speaker === "agent" ? "AI 助理" : "越南客户"}</span>
        ${escapeHtml(turn.text)}
      </div>
    `).join("")
    : '<p class="empty">暂无转录。</p>';
  transcriptElement.scrollTop = transcriptElement.scrollHeight;
}

async function openCall(callId) {
  const call = await api(`/api/calls/${callId}`);
  activeCallId = call.id;
  callTitle.textContent = `${call.contact_name || call.phone} · 通话 #${call.id}`;
  callState.textContent = call.status.toUpperCase();
  simulateForm.hidden = call.mode !== "mock" || call.status === "completed";
  renderTurns(call.turns);
}

async function startCall(contactId, mode) {
  const call = await api("/api/calls", {
    method: "POST",
    body: JSON.stringify({ contactId, mode })
  });
  await openCall(call.id);
  await loadCalls();
  if (mode === "mock") {
    const detail = await api(`/api/calls/${call.id}`);
    const opening = detail.turns.at(-1)?.text;
    if (opening) speakVietnamese(opening);
  }
}

document.querySelector("#contact-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await api("/api/contacts", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    formElement.reset();
    await loadContacts();
  } catch (error) {
    alert(error.message);
  }
});

contactsElement.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-call]");
  if (!button) return;
  button.disabled = true;
  try {
    await startCall(Number(button.dataset.call), button.dataset.mode);
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

callsElement.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-open-call]");
  if (target) await openCall(Number(target.dataset.openCall));
});

simulateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#customer-text");
  if (!activeCallId || !input.value.trim()) return;
  const customerText = input.value.trim();
  input.value = "";
  try {
    const result = await api(`/api/calls/${activeCallId}/simulate`, {
      method: "POST",
      body: JSON.stringify({ text: customerText })
    });
    renderTurns(result.turns);
    speakVietnamese(result.decision.replyVi);
    callState.textContent = result.decision.action === "end" ? "COMPLETED" : "IN-PROGRESS";
    simulateForm.hidden = result.decision.action === "end";
    await Promise.all([loadCalls(), loadContacts()]);
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#refresh").addEventListener("click", async () => {
  await Promise.all([loadStatus(), loadContacts(), loadCalls()]);
});

await loadStatus();
await Promise.all([loadContacts(), loadCalls()]);
