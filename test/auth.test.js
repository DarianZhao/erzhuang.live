import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized } from "../src/auth.js";

test("mock mode works locally without configured login", () => {
  assert.equal(isAuthorized({ headers: {} }), true);
});
