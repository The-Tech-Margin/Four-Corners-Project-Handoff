/**
 * Project repository stub.
 *
 * A production adapter must:
 *  - scope every read and write to the owner, and expose a project publicly
 *    only when `published && inGallery` (the rule row-level security used to
 *    enforce in the original deployment);
 *  - run `update` as an atomic read-modify-write, since the visibility rules
 *    in lib/projects/rules.ts decide from the document they are handed;
 *  - keep slugs unique across the deployment;
 *  - preserve array order — position is meaning for context items, links and
 *    voice notes.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import { NotConfiguredError } from "@/lib/ports/errors";
import type { ProjectRepository } from "@/lib/ports/projects";

const fail = (): never => {
  throw new NotConfiguredError(
    "ProjectRepository",
    "FC_DATA_ADAPTER",
    "Implement lib/ports/projects.ts against your database. docs/OBJECT-MODEL.md describes the document.",
  );
};

export function createStubProjectRepository(): ProjectRepository {
  return {
    getById: fail,
    getBySlug: fail,
    listByOwner: fail,
    listGallery: fail,
    listGalleryAll: fail,
    listChildren: fail,
    listSitemapEntries: fail,
    countOwnerGalleryProjects: fail,
    maxVersionInLineage: fail,
    findTranscriptionTextByAudioKey: fail,
    insert: fail,
    update: fail,
    delete: fail,
  };
}
