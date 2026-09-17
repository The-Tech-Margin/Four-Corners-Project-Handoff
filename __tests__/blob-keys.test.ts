import { describe, it, expect } from "vitest";
import {
  contextMediaKey,
  isOwnedBy,
  isTempTranscribeKey,
  isValidBlobKey,
  mainImageKey,
  ownerOfKey,
  sanitizeFileName,
  voiceRecordingKey,
} from "@/lib/storage/keys";
import { blobUrl, isAppBlobUrl, parseAppBlobUrl } from "@/lib/storage/blob-url";
import { bucketForKey } from "@/lib/projects/blob-refs";

const OWNER = "owner-1";

describe("blob keys", () => {
  it("builds keys under the owner prefix", () => {
    expect(mainImageKey(OWNER, "p1", "jpg")).toBe(`${OWNER}/main-images/p1.jpg`);
    expect(contextMediaKey(OWNER, "p1", "a photo.JPG")).toBe(
      `${OWNER}/context-images/p1/a-photo.JPG`,
    );
    expect(voiceRecordingKey(OWNER, "p1", "rec1", "webm")).toBe(
      `${OWNER}/voice-recordings/p1/rec1.webm`,
    );
  });

  it("rejects traversal and absolute paths", () => {
    for (const bad of ["../secrets", "a/../../b", "/leading", "trailing/", "a\\b", "a//b", ""]) {
      expect(isValidBlobKey(bad)).toBe(false);
    }
  });

  it("reads the owner back out of a key", () => {
    expect(ownerOfKey(`${OWNER}/main-images/p1.jpg`)).toBe(OWNER);
    expect(ownerOfKey("../nope")).toBeNull();
    expect(isOwnedBy(`${OWNER}/main-images/p1.jpg`, OWNER)).toBe(true);
    expect(isOwnedBy(`${OWNER}/main-images/p1.jpg`, "someone-else")).toBe(false);
  });

  it("recognises the transcription scratch prefix for its owner only", () => {
    const key = `${OWNER}/temp-transcribe/abc.webm`;
    expect(isTempTranscribeKey(key, OWNER)).toBe(true);
    expect(isTempTranscribeKey(key, "someone-else")).toBe(false);
  });

  it("sanitises file names into a single safe segment", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("routes voice keys to the private bucket", () => {
    expect(bucketForKey(`${OWNER}/voice-recordings/p1/r.webm`)).toBe("voice-recordings");
    expect(bucketForKey(`${OWNER}/temp-transcribe/r.webm`)).toBe("voice-recordings");
    expect(bucketForKey(`${OWNER}/context-images/p1/a.jpg`)).toBe("context-media");
  });
});

describe("blob URLs", () => {
  it("round-trips a bucket and key", () => {
    const url = blobUrl("context-media", `${OWNER}/context-images/p1/a b.jpg`);
    expect(isAppBlobUrl(url)).toBe(true);
    expect(parseAppBlobUrl(url)).toEqual({
      bucket: "context-media",
      key: `${OWNER}/context-images/p1/a b.jpg`,
    });
  });

  it("carries the project grant and rendition hints as query params", () => {
    const url = blobUrl("voice-recordings", `${OWNER}/voice-recordings/p1/r.webm`, {
      projectId: "p1",
      width: 400,
    });
    expect(url).toContain("project=p1");
    expect(url).toContain("w=400");
  });

  it("returns null for URLs that are not blob routes", () => {
    expect(parseAppBlobUrl("https://example.org/photo.jpg")).toBeNull();
    expect(parseAppBlobUrl("/api/blobs/not-a-bucket/key")).toBeNull();
  });
});
