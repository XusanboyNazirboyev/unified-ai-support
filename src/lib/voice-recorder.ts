// Browser-only: records the microphone as PCM and returns a complete 16 kHz mono WAV file,
// which every browser (incl. iOS Safari) produces reliably and the model can always decode.

const TARGET_RATE = 16000;

function downsample(chunks: readonly Float32Array[], fromRate: number): Float32Array {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const input = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    input.set(c, offset);
    offset += c.length;
  }
  if (fromRate <= TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const value of samples) {
    const s = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, s * (s < 0 ? 32768 : 32767), true);
    offset += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export type WavRecording = { stop: () => Promise<File>; cancel: () => void };

export async function recordWav(): Promise<WavRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    await context.resume();
    const audioContext = context;
    const source = audioContext.createMediaStreamSource(stream);
    const node = audioContext.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(audioContext.destination);
    let stopped = false;
    const teardown = () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      source.disconnect();
      node.onaudioprocess = null;
      void audioContext.close();
    };
    return {
      async stop() {
        if (stopped) throw new Error("Yozuv allaqachon to'xtatilgan");
        const rate = audioContext.sampleRate;
        teardown();
        const samples = downsample(chunks, rate);
        if (samples.length < TARGET_RATE * 0.5) throw new Error("Yozuv juda qisqa. Qaytadan yozib ko'ring.");
        const blob = encodeWav(samples, Math.min(rate, TARGET_RATE));
        return new File([blob], "ovozli-xabar.wav", { type: "audio/wav" });
      },
      cancel() {
        if (!stopped) teardown();
      },
    };
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    await context?.close();
    throw error;
  }
}
