/**
 * Project database operations — barrel re-export.
 *
 * Split into:
 *   projects-transforms.ts — types, select strings, row→ProjectRecord transforms
 *   projects-queries.ts    — read-only DB queries
 *   projects-crud.ts       — create, update, delete, toggles
 */

// ── Types & transforms ──────────────────────────────────────────────────────
export {
  type ProjectRecord,
  GALLERY_SELECT,
  NORMALIZED_SELECT,
  LISTING_SELECT,
  buildMetadataFromNormalized,
  buildListingMetadata,
  buildGalleryMetadata,
  cleanEmptyFields,
  validateMetadata,
} from "./projects-transforms";

// ── Read queries ────────────────────────────────────────────────────────────
export {
  getProject,
  getProjectBySlug,
  userHasFileWithSlug,
  getProjectBySlugOrId,
  listUserProjects,
  searchProjects,
  getProjectChildren,
  getGalleryImageSets,
  getAdjacentGalleryItems,
  getProjectsByLocation,
} from "./projects-queries";

// ── Write operations ────────────────────────────────────────────────────────
export {
  createProject,
  updateProjectSlug,
  updateProject,
  deleteProject,
  togglePublish,
  toggleGallery,
  updateProjectTags,
  GALLERY_LIMIT_REACHED,
} from "./projects-crud";
