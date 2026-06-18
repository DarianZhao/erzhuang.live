import { config } from "../config.js";
import { mockDecision, systemPrompt } from "../conversation.js";

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

export async function decideReply({ customerText, state, contact, signal }) {
  if (!config.deepseek.apiKey || config.appMode === "mock") {
    return mockDecision(customerText, state);
  }
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.deepseek.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt(state, contact) },
        { role: "user", content: customerText }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 300,
      thinking: { type: "disabled" }
    })
  });
  if (!response.ok) {
    throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  return extractJson(payload.choices?.[0]?.message?.content || "{}");
}
