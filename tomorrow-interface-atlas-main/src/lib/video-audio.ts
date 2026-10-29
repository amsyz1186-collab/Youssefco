import type { AutoVideoEditPlan } from "@/lib/auto-video-edit";

const SAMPLE_RATE = 24_000;

const MUSIC: Record<string, { tempo: number; chords: number[][] }> = {
  Comedy: {
    tempo: 108,
    chords: [
      [261.63, 329.63, 392],
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 246.94, 293.66],
    ],
  },
  Action: {
    tempo: 122,
    chords: [
      [110, 164.81, 220],
      [130.81, 164.81, 196],
      [98, 146.83, 196],
      [110, 164.81, 220],
    ],
  },
  Drama: {
    tempo: 76,
    chords: [
      [146.83, 174.61, 220],
      [130.81, 164.81, 196],
      [116.54, 146.83, 174.61],
      [130.81, 164.81, 196],
    ],
  },
  Mix: {
    tempo: 96,
    chords: [
      [196, 246.94, 293.66],
      [146.83, 196, 246.94],
      [164.81, 196, 246.94],
      [130.81, 164.81, 196],
    ],
  },
};

export function createVideoSoundtrack(
  duration: number,
  mood: string,
  plan: AutoVideoEditPlan,
  timeline: Array<{ start: number; end: number }>,
  options: { includeMusic: boolean; includeEffects: boolean },
): Uint8Array | null {
  if (!options.includeMusic && !options.includeEffects) return null;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
    throw new Error("مدة المقطع الصوتي غير صالحة.");
  }

  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);
  if (options.includeMusic) addMusic(samples, mood);
  if (options.includeEffects) addCutEffects(samples, mood, plan, timeline);

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? Math.min(1.6, 0.82 / peak) : 1;
  const wav = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(wav);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]! * gain));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(wav);
}

function addMusic(samples: Float32Array, mood: string) {
  const arrangement = MUSIC[mood] ?? MUSIC["Mix"]!;
  const beatDuration = 60 / arrangement.tempo;
  const barDuration = beatDuration * 4;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const beatPosition = time / beatDuration;
    const beat = Math.floor(beatPosition);
    const beatPhase = beatPosition - beat;
    const bar = Math.floor(beat / 4);
    const chord = arrangement.chords[bar % arrangement.chords.length]!;
    const pad = chord.reduce(
      (sum, frequency, note) =>
        sum + Math.sin(2 * Math.PI * frequency * time + note * 0.17) * (note === 0 ? 0.055 : 0.035),
      0,
    );
    const bassEnvelope = Math.exp(-beatPhase * 5);
    const bass = Math.sin(2 * Math.PI * (chord[0]! / 2) * time) * bassEnvelope * 0.13;
    const eighthPosition = time / (beatDuration / 2);
    const eighthPhase = eighthPosition - Math.floor(eighthPosition);
    const melodyNote = chord[Math.floor(eighthPosition + bar) % chord.length]!;
    const pluck =
      (Math.sin(2 * Math.PI * melodyNote * time) +
        Math.sin(2 * Math.PI * melodyNote * 2 * time) * 0.22) *
      Math.exp(-eighthPhase * 7) *
      0.055;

    let percussion = 0;
    const kickPhase = time % (beatDuration * 2);
    if (kickPhase < 0.24) {
      const kickEnvelope = Math.exp(-kickPhase * 17);
      percussion +=
        Math.sin(2 * Math.PI * (46 * kickPhase + 22 * kickPhase * kickPhase)) * kickEnvelope * 0.16;
    }
    const halfBeat = beatPosition % 2 >= 1;
    if (halfBeat && beatPhase < 0.17) {
      const snareEnvelope = Math.exp(-beatPhase * 24);
      percussion +=
        (deterministicNoise(index) * 0.65 + Math.sin(2 * Math.PI * 185 * beatPhase) * 0.35) *
        snareEnvelope *
        0.07;
    }
    const hatPhase = time % (beatDuration / 2);
    if (hatPhase < 0.025) {
      percussion += deterministicNoise(index + SAMPLE_RATE) * Math.exp(-hatPhase * 100) * 0.024;
    }

    const barSwell = 0.88 + 0.12 * Math.sin((2 * Math.PI * (time % barDuration)) / barDuration);
    samples[index] = (pad + bass + pluck + percussion) * barSwell;
  }
}

function addCutEffects(
  samples: Float32Array,
  mood: string,
  plan: AutoVideoEditPlan,
  timeline: Array<{ start: number; end: number }>,
) {
  const defaultEffect = mood === "Comedy" ? "pop" : mood === "Action" ? "impact" : "whoosh";
  for (let index = 1; index < plan.segments.length; index += 1) {
    const selected = plan.segments[index]!.sound;
    addCutEffect(samples, timeline[index]!.start, selected === "none" ? defaultEffect : selected);
  }
}

function addCutEffect(
  samples: Float32Array,
  startSeconds: number,
  effect: "whoosh" | "pop" | "impact",
) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const duration = effect === "whoosh" ? 0.48 : effect === "impact" ? 0.36 : 0.22;
  const length = Math.min(Math.floor(duration * SAMPLE_RATE), samples.length - start);
  for (let offset = 0; offset < length; offset += 1) {
    const index = start + offset;
    const time = offset / SAMPLE_RATE;
    let value: number;
    if (effect === "whoosh") {
      const envelope = (1 - Math.exp(-time * 15)) * Math.exp(-time * 4.5);
      value =
        (deterministicNoise(index + 17) * 0.7 +
          Math.sin(2 * Math.PI * (180 * time + 1250 * time * time)) * 0.3) *
        envelope *
        0.24;
    } else if (effect === "impact") {
      const envelope = Math.exp(-time * 10);
      value =
        (Math.sin(2 * Math.PI * (55 * time + 115 * time * time)) * 0.8 +
          deterministicNoise(index + 31) * 0.2) *
        envelope *
        0.34;
    } else {
      const envelope = Math.exp(-time * 15);
      value =
        (Math.sin(2 * Math.PI * 740 * time) + Math.sin(2 * Math.PI * 1480 * time) * 0.22) *
        envelope *
        0.2;
    }
    samples[index] = samples[index]! + value;
  }
}

function deterministicNoise(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
