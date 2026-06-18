import test from "node:test";
import assert from "node:assert/strict";
import {
  linear16ToMuLaw,
  pcm16ToMuLawBuffer,
  resampleLinear
} from "../src/audio.js";

test("μ-law encoder returns valid bytes", () => {
  assert.equal(linear16ToMuLaw(0), 255);
  assert.ok(linear16ToMuLaw(32767) >= 0);
  assert.ok(linear16ToMuLaw(-32768) <= 255);
});

test("PCM conversion preserves sample count", () => {
  const output = pcm16ToMuLawBuffer(new Int16Array([0, 1000, -1000]));
  assert.equal(output.length, 3);
});

test("linear resampler converts 32kHz to 8kHz", () => {
  const input = new Int16Array(32000);
  const output = resampleLinear(input, 32000, 8000);
  assert.equal(output.length, 8000);
});
