"use client";

import { useFourCornersStore } from "@/lib/store";
import { VoiceTextarea } from "@/components/voice-textarea";
import { VoiceInput } from "@/components/voice-input";
import { SectionHeader } from "@/components/section-header";

export function BackstoryEditor() {
  const { backStory, mode, selectedCorners, updateBackStory } =
    useFourCornersStore();

  // Hide in minimal mode if not selected
  if (mode === "minimal" && !selectedCorners.backstory) {
    return null;
  }

  return (
    <section className="mb-4 sm:mb-6">
      <SectionHeader
        title="Backstory"
        color="corner-backstory"
        cornerLabel="backStory · bottom-left"
        tooltipTitle="Backstory (Bottom Left)"
        tooltipContent="This is where the photographer puts text or audio explaining what was going on at the time the photograph was made. For example, 'The politician had been shaking hands with all kinds of people for 45 minutes when he stopped and picked up this baby. The baby's mother was not happy. She told me afterwards that she had been just walking by.'"
      />

      <VoiceTextarea
        value={backStory.text}
        onChange={(value) => updateBackStory("text", value)}
        placeholder="Tell the story. What's happening here? Who is this person? Why does this moment matter?"
        ariaLabel="Backstory narrative text"
        rows={4}
        showCharCount={true}
        borderColor="border border-border border-l-[5px] border-l-corner-backstory"
        fieldId="backstory-text"
        mobileFlush
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-3">
        <VoiceInput
          value={backStory.author}
          onChange={(value) => updateBackStory("author", value)}
          placeholder="Your name"
          ariaLabel="Author name"
        />
        <VoiceInput
          value={backStory.date}
          onChange={(value) => updateBackStory("date", value)}
          placeholder="Date captured"
          ariaLabel="Date captured"
        />
      </div>
      {(mode === "standard" || mode === "complete") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mt-2">
          <VoiceInput
            value={backStory.publication}
            onChange={(value) => updateBackStory("publication", value)}
            placeholder="Organization/Media Outlet"
            ariaLabel="Organization or Media Outlet"
          />
          <VoiceInput
            value={backStory.publicationUrl}
            onChange={(value) => updateBackStory("publicationUrl", value)}
            placeholder="Publication URL"
            type="url"
            ariaLabel="Publication URL"
          />
        </div>
      )}
    </section>
  );
}
