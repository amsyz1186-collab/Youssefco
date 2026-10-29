import { describe, expect, it } from "vitest";
import { createVideoSoundtrack } from "@/lib/video-audio";

const plan = {
  title: "Test edit",
  segments: [
    { start: 0, end: 0.5, sound: "none" as const },
    { start: 0.5, end: 1, sound: "none" as const },
  ],
};

const timeline = [
  { start: 0, end: 0.5 },
  { start: 0.5, end: 1 },
];

function pcmSamples(wav: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return Array.from({ length: (wav.byteLength - 44) / 2 }, (_, index) =>
    view.getInt16(44 + index * 2, true),
  );
}

describe("createVideoSoundtrack", () => {
  it("returns no audio when music and sound effects are disabled", () => {
    expect(
      createVideoSoundtrack(1, "Mix", plan, timeline, {
        includeMusic: false,
        includeEffects: false,
      }),
    ).toBeNull();
  });

  it("creates a valid, audible WAV music bed", () => {
    const wav = createVideoSoundtrack(1, "Drama", plan, timeline, {
      includeMusic: true,
      includeEffects: false,
    });
    expect(wav).not.toBeNull();
    expect(new TextDecoder().decode(wav!.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav!.slice(8, 12))).toBe("WAVE");
    expect(wav).toHaveLength(44 + 24_000 * 2);
    expect(pcmSamples(wav!).some((sample) => sample !== 0)).toBe(true);
  });

  it("adds a transition sound even when the AI plan leaves its sound unspecified", () => {
    const wav = createVideoSoundtrack(1, "Action", plan, timeline, {
      includeMusic: false,
      includeEffects: true,
    });
    const samples = pcmSamples(wav!);
    const beforeCut = samples.slice(0, 10_000);
    const afterCut = samples.slice(12_000, 20_000);
    expect(beforeCut.every((sample) => sample === 0)).toBe(true);
    expect(afterCut.some((sample) => sample !== 0)).toBe(true);
  });
});
