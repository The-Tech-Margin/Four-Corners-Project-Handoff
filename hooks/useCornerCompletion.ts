/**
 * Hook that derives completion state for each Four Corners corner.
 * Extracted from InteractiveImagePreview's data-presence logic
 * so it can be reused across editor modes.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { useFourCornersStore } from "@/lib/store";

export interface CornerCompletion {
  credit: boolean;
  backstory: boolean;
  context: boolean;
  links: boolean;
}

export function useCornerCompletion(): CornerCompletion {
  const creativeCommons = useFourCornersStore((s) => s.creativeCommons);
  const photographerInfo = useFourCornersStore((s) => s.photographerInfo);
  const ethics = useFourCornersStore((s) => s.ethics);
  const backStory = useFourCornersStore((s) => s.backStory);
  const context = useFourCornersStore((s) => s.context);
  const links = useFourCornersStore((s) => s.links);

  return {
    credit: Boolean(
      creativeCommons.copyright ||
        creativeCommons.description ||
        photographerInfo?.bio ||
        ethics?.noManipulation ||
        ethics?.noStaging ||
        ethics?.informedConsent,
    ),
    backstory: Boolean(backStory.text || backStory.author || backStory.date),
    context: context.length > 0,
    links: links.length > 0,
  };
}
