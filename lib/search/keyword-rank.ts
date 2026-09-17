/**
 * Keyword ranking over project documents. Mirrors the weighting the
 * database full-text index used: title and tags first, then the narrative
 * fields, then everything else. A semantic SearchPort can replace it.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { ProjectDocument } from "@/lib/projects/types";

const WEIGHTS = { a: 8, b: 4, c: 2, d: 1 } as const;

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

interface WeightedText {
  weight: number;
  text: string;
}

function weightedTexts(doc: ProjectDocument): WeightedText[] {
  const m = doc.metadata;
  const texts: WeightedText[] = [
    { weight: WEIGHTS.a, text: doc.title ?? "" },
    { weight: WEIGHTS.a, text: doc.slug ?? "" },
    { weight: WEIGHTS.a, text: (doc.tags ?? []).join(" ") },
    { weight: WEIGHTS.a, text: m.backStory?.author ?? "" },
    { weight: WEIGHTS.b, text: m.backStory?.text ?? "" },
    { weight: WEIGHTS.b, text: m.creativeCommons?.description ?? "" },
    { weight: WEIGHTS.b, text: m.creativeCommons?.copyright ?? "" },
    { weight: WEIGHTS.c, text: m.photographerInfo?.bio ?? "" },
    { weight: WEIGHTS.c, text: m.location?.formattedLocation ?? "" },
    { weight: WEIGHTS.c, text: m.ethics?.customEthicsText ?? "" },
  ];

  for (const item of m.context ?? []) {
    texts.push({ weight: WEIGHTS.d, text: [item.caption, item.description, item.credit].filter(Boolean).join(" ") });
  }
  for (const link of m.links ?? []) {
    texts.push({ weight: WEIGHTS.d, text: [link.title, link.source].filter(Boolean).join(" ") });
  }
  for (const voice of m.voiceTranscriptions ?? []) {
    texts.push({ weight: WEIGHTS.d, text: voice.text ?? "" });
  }

  return texts.filter((t) => t.text.trim().length > 0);
}

/** Score one document: 0 when any query word is missing (AND semantics). */
export function scoreProject(doc: ProjectDocument, query: string): number {
  const words = tokenize(query);
  if (words.length === 0) return 0;

  const texts = weightedTexts(doc);
  let total = 0;

  for (const word of words) {
    let wordScore = 0;
    for (const { weight, text } of texts) {
      const haystack = text.toLowerCase();
      let index = haystack.indexOf(word);
      while (index !== -1) {
        wordScore += weight;
        index = haystack.indexOf(word, index + word.length);
      }
    }
    if (wordScore === 0) return 0;
    total += wordScore;
  }

  return total;
}

/** Rank documents by score, newest first among equal scores. */
export function rankProjectsByKeywords(
  docs: ProjectDocument[],
  query: string,
): ProjectDocument[] {
  return docs
    .map((doc) => ({ doc, score: scoreProject(doc, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (a.doc.createdAt < b.doc.createdAt ? 1 : a.doc.createdAt > b.doc.createdAt ? -1 : 0),
    )
    .map((entry) => entry.doc);
}
