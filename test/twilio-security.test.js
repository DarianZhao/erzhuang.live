import test from "node:test";
import assert from "node:assert/strict";
import { validateTwilioSignature } from "../src/twilio-security.js";

test("mock mode permits unsigned local Twilio callbacks", () => {
  assert.equal(
    validateTwilioSignature({ signature: "", url: "http://localhost/test" }),
    true
  );
});
