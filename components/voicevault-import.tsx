"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFourCornersStore } from "@/lib/store";
import Link from "next/link";

interface VoiceNote {
  id: string;
  title: string;
  transcript: string;
  four_corners: {
    who?: string[];
    what?: string;
    where?: {
      location?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    when?: { date?: string; time?: string; context?: string };
    caption?: string;
    backstory?: string;
    links?: string[];
  };
  photo_metadata: Record<string, unknown>;
  created_at: string;
  duration_seconds: number;
  audio_url?: string;
}

export function VoiceVaultImport() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [showImportChoice, setShowImportChoice] = useState(false);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);

  const {
    updateBackStory,
    updateCreativeCommons,
    addLink,
    reset,
  } = useFourCornersStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadNotes() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("voice_notes")
          .select(
            "id, title, transcript, four_corners, photo_metadata, created_at, duration_seconds, audio_url"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        setNotes(data || []);
      }
      setIsLoading(false);
    }

    loadNotes();

    const channel = supabase
      .channel("voice_notes_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "voice_notes",
        },
        (payload: { new: Record<string, unknown> }) => {
          setNotes((prev) => [payload.new as unknown as VoiceNote, ...prev].slice(0, 10));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleImportClick = (note: VoiceNote) => {
    setSelectedNote(note);
    setShowImportChoice(true);
  };

  const importNoteData = (note: VoiceNote) => {
    const fc = note.four_corners;

    // BACKSTORY LAYER - Narrative about the image
    if (fc.backstory) {
      updateBackStory("text", fc.backstory);
    } else if (fc.who || fc.what) {
      // Build backstory from 5W's if no explicit backstory
      const parts = [];
      if (fc.who?.length) parts.push(fc.who.join(", "));
      if (fc.what) parts.push(fc.what);
      if (fc.when?.context) parts.push(fc.when.context);
      if (parts.length > 0) {
        updateBackStory("text", parts.join(". "));
      }
    }

    // Date from when.date or note created date
    const dateToUse = fc.when?.date || note.created_at;
    if (dateToUse) {
      updateBackStory("date", new Date(dateToUse).toISOString().split("T")[0]);
    }

    // COPYRIGHT LAYER - Caption/description for publication
    if (fc.caption) {
      updateCreativeCommons("description", fc.caption);
    }

    // GEOGRAPHIC LOCATION (separate from Four Corners metadata)
    // Only update if VoiceVault provides coordinates (non-destructive)
    // City/state/country alone without lat/long is insufficient for location field

    // LINKS LAYER - Source documents, references
    if (fc.links?.length) {
      fc.links.forEach((url) =>
        addLink({ title: url, url, source: "voicevault" })
      );
    }
  };

  const importIntoCurrent = async () => {
    if (!selectedNote) return;
    setImporting(selectedNote.id);
    setShowImportChoice(false);

    importNoteData(selectedNote);

    setTimeout(() => {
      setImporting(null);
      setSelectedNote(null);
    }, 500);
  };

  const importAsNew = async () => {
    if (!selectedNote) return;
    setImporting(selectedNote.id);
    setShowImportChoice(false);

    reset();
    importNoteData(selectedNote);

    setTimeout(() => {
      setImporting(null);
      setSelectedNote(null);
    }, 500);
  };

  if (!user) {
    return (
      <section className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-4 h-4 text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            VoiceVault
          </span>
        </div>
        <Link
          href="/auth/login"
          className="block w-full py-3 text-center text-sm text-gray-500 border border-dashed border-border rounded-xl hover:border-accent hover:text-accent transition-colors"
        >
          Sign in to import voice notes
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-4 sm:mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface border border-border hover:border-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-gray-200">
              VoiceVault
            </span>
            {notes.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
                {notes.length} notes
              </span>
            )}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading voice notes...
            </div>
          ) : notes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500 mb-2">No voice notes yet</p>
              <a
                href="https://voicevault.thetechmargin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline"
              >
                Open VoiceVault to record →
              </a>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="p-3 rounded-lg bg-surface-alt border border-border/50 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-200 truncate">
                      {note.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {note.four_corners?.caption ||
                        note.transcript?.slice(0, 100)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <FourCornersCompletionDots fc={note.four_corners} />
                      <span className="text-xs text-gray-600">
                        {new Date(note.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleImportClick(note)}
                    disabled={importing === note.id}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      importing === note.id
                        ? "bg-accent text-bg"
                        : "bg-accent/10 text-accent hover:bg-accent/20"
                    }`}
                  >
                    {importing === note.id ? "✓ Imported" : "Import"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showImportChoice && selectedNote && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
            onClick={() => setShowImportChoice(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md bg-surface border border-border rounded-xl shadow-2xl p-6 animate-in zoom-in-95 fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-200 mb-2">
              Import Voice Note
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              How would you like to import &quot;{selectedNote.title}&quot;?
            </p>
            <div className="space-y-3">
              <button
                onClick={importIntoCurrent}
                className="w-full p-4 bg-surface-alt hover:bg-surface-alt/70 border border-border hover:border-accent/50 rounded-lg transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                    <svg
                      className="w-5 h-5 text-accent"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 mb-1">
                      Add to Current Project
                    </div>
                    <div className="text-xs text-gray-500">
                      Merge voice note data into the current file
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={importAsNew}
                className="w-full p-4 bg-surface-alt hover:bg-surface-alt/70 border border-border hover:border-accent/50 rounded-lg transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                    <svg
                      className="w-5 h-5 text-accent"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 mb-1">
                      Create New Project
                    </div>
                    <div className="text-xs text-gray-500">
                      Start fresh with voice note as a new file
                    </div>
                  </div>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowImportChoice(false)}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FourCornersCompletionDots({ fc }: { fc: VoiceNote["four_corners"] }) {
  const hasWho = fc?.who && fc.who.length > 0;
  const hasWhat = !!fc?.what;
  const hasWhere = fc?.where && Object.values(fc.where).some(Boolean);
  const hasWhen = fc?.when && Object.values(fc.when).some(Boolean);

  return (
    <div className="flex items-center gap-1">
      <span
        className={`w-2 h-2 rounded-full ${
          hasWho ? "bg-[#09fff0]" : "bg-gray-700"
        }`}
        title="Who"
      />
      <span
        className={`w-2 h-2 rounded-full ${
          hasWhat ? "bg-[#e904e5]" : "bg-gray-700"
        }`}
        title="What"
      />
      <span
        className={`w-2 h-2 rounded-full ${
          hasWhere ? "bg-[#a1ff00]" : "bg-gray-700"
        }`}
        title="Where"
      />
      <span
        className={`w-2 h-2 rounded-full ${
          hasWhen ? "bg-[#ff9500]" : "bg-gray-700"
        }`}
        title="When"
      />
    </div>
  );
}
