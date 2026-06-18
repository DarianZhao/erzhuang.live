const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

export function linear16ToMuLaw(sample) {
  let sign = 0;
  let pcm = Math.max(-32768, Math.min(32767, sample));
  if (pcm < 0) {
    sign = 0x80;
    pcm = -pcm;
  }
  pcm = Math.min(pcm, MULAW_CLIP) + MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

export function resampleLinear(samples, sourceRate, targetRate = 8000) {
  if (sourceRate === targetRate) return samples;
  const outputLength = Math.max(1, Math.floor(samples.length * targetRate / sourceRate));
  const output = new Int16Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = position - left;
    output[i] = Math.round(samples[left] * (1 - fraction) + samples[right] * fraction);
  }
  return output;
}

export function pcm16ToMuLawBuffer(samples) {
  const output = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    output[i] = linear16ToMuLaw(samples[i]);
  }
  return output;
}

export function parseWavPcm16(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("MiniMax did not return a valid WAV file");
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    } else if (id === "data") {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM WAV audio is supported");
  }
  const frameCount = data.length / 2 / format.channels;
  const mono = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      total += data.readInt16LE((frame * format.channels + channel) * 2);
    }
    mono[frame] = Math.round(total / format.channels);
  }
  return { samples: mono, sampleRate: format.sampleRate };
}

export function wavToTwilioMuLaw(buffer) {
  const { samples, sampleRate } = parseWavPcm16(buffer);
  return pcm16ToMuLawBuffer(resampleLinear(samples, sampleRate, 8000));
}

export function chunkBuffer(buffer, size = 1600) {
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    chunks.push(buffer.subarray(offset, offset + size));
  }
  return chunks;
}
