import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStateUpdates,
  initialState,
  mockDecision
} from "../src/conversation.js";
import { normalizeVietnamPhone } from "../src/providers/twilio.js";

test("Vietnam phone normalization", () => {
  assert.equal(normalizeVietnamPhone("090 123 4567"), "+84901234567");
  assert.equal(normalizeVietnamPhone("+84 901234567"), "+84901234567");
});

test("do-not-call request ends the conversation", () => {
  const decision = mockDecision("Đừng gọi cho tôi nữa", initialState());
  assert.equal(decision.action, "end");
  assert.equal(decision.stateUpdates.doNotCall, true);
});

test("state updates ignore unknown fields", () => {
  const state = applyStateUpdates(initialState(), {
    stage: "technical",
    inventedField: "no"
  });
  assert.equal(state.stage, "technical");
  assert.equal("inventedField" in state, false);
});
