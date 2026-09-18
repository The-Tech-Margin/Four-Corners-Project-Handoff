import { describe, it, expect } from "vitest";
import { dedupeVoiceNotes, hasAudioSource } from "@/components/fc-voice-note";
import type { VoiceTranscription } from "@/lib/field-registry";

function vt(overrides: Partial<VoiceTranscription>): VoiceTranscription {
  return {
    id: Math.random().toString(36).slice(2),
    recordingId: "rec",
    text: "",
    transcribedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  } as VoiceTranscription;
}

describe("hasAudioSource", () => {
  it("is true for any resolvable source", () => {
    expect(hasAudioSource(vt({ audioStorageUrl: "https://x/y.webm" }))).toBe(true);
    expect(hasAudioSource(vt({ audioStoragePath: "u/p/r.webm" }))).toBe(true);
    expect(hasAudioSource(vt({ audioDataUrl: "data:audio/webm;base64,AA" }))).toBe(true);
    expect(hasAudioSource(vt({ audioBlobId: 3 }))).toBe(true);
  });

  it("is false with no source", () => {
    expect(hasAudioSource(vt({ text: "hello" }))).toBe(false);
  });
});

describe("dedupeVoiceNotes", () => {
  it("drops a text-only entry duplicating a recorded clip's transcript (the double-render bug)", () => {
    const textOnly = vt({ id: "a", text: "The balloon metaphor reflects life's arc." });
    const withAudio = vt({
      id: "b",
      text: "The balloon metaphor reflects life's arc.",
      audioStorageUrl: "https://x/y.webm",
    });
    const result = dedupeVoiceNotes([textOnly, withAudio]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("keeps text-only notes when no sibling has audio", () => {
    const a = vt({ id: "a", text: "only text" });
    expect(dedupeVoiceNotes([a])).toHaveLength(1);
  });

  it("keeps distinct text-only notes alongside audio clips", () => {
    const audio = vt({ id: "a", text: "transcript A", audioStorageUrl: "https://x/a.webm" });
    const distinct = vt({ id: "b", text: "completely different note" });
    const result = dedupeVoiceNotes([audio, distinct]);
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("drops empty text-only entries when a sibling has audio", () => {
    const audio = vt({ id: "a", audioStoragePath: "u/p/a.webm" });
    const empty = vt({ id: "b", text: "" });
    const result = dedupeVoiceNotes([audio, empty]);
    expect(result.map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps multiple audio clips (multi-clip fields render every recording)", () => {
    const a = vt({ id: "a", text: "one", audioStorageUrl: "https://x/a.webm" });
    const b = vt({ id: "b", text: "two", audioStoragePath: "u/p/b.webm" });
    const c = vt({ id: "c", audioBlobId: 5 });
    expect(dedupeVoiceNotes([a, b, c])).toHaveLength(3);
  });

  it("collapses duplicate ids defensively", () => {
    const a1 = vt({ id: "same", text: "x", audioStorageUrl: "https://x/a.webm" });
    const a2 = vt({ id: "same", text: "x", audioStorageUrl: "https://x/a.webm" });
    expect(dedupeVoiceNotes([a1, a2])).toHaveLength(1);
  });
});
