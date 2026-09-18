/**
 * Project slugs. One implementation for the editor, the rename dialog and
 * the server — they used to carry byte-identical copies of this function.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+/, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) && slug.length <= 120;
}
