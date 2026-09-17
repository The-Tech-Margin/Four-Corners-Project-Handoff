import { useFourCornersStore } from "@/lib/store";
import type { FourCornersMetadataExtended } from "@/lib/schema";

export function useProjectMetadata() {
  const backStory = useFourCornersStore((state) => state.backStory);
  const context = useFourCornersStore((state) => state.context);
  const links = useFourCornersStore((state) => state.links);
  const creativeCommons = useFourCornersStore((state) => state.creativeCommons);
  const ethics = useFourCornersStore((state) => state.ethics);
  const photographerInfo = useFourCornersStore(
    (state) => state.photographerInfo
  );
  const location = useFourCornersStore((state) => state.location);
  const photoMetadata = useFourCornersStore((state) => state.photoMetadata);
  const voiceTranscriptions = useFourCornersStore(
    (state) => state.voiceTranscriptions
  );
  const meta = useFourCornersStore((state) => state.meta);

  const buildMetadata = (): FourCornersMetadataExtended => ({
    backStory,
    context,
    links,
    creativeCommons,
    ethics,
    photographerInfo,
    location,
    photoMetadata,
    voiceTranscriptions: voiceTranscriptions.map((vt) => ({
      id: vt.id,
      recordingId: vt.recordingId,
      text: vt.text,
      transcribedAt: vt.transcribedAt,
      fieldId: vt.fieldId,
      audioStoragePath: vt.audioStoragePath,
      audioStorageUrl: vt.audioStorageUrl,
      mimeType: vt.mimeType,
      duration: vt.duration,
      audioDataUrl: vt.audioDataUrl,
    })),
    meta,
  });

  return { buildMetadata };
}
