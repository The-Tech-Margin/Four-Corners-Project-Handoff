/**
 * /explore/[slug] — legacy route. Explore now renders inline as a tab on the
 * view page (the card-list implementation at every width; the desktop SVG
 * tree/force graph was removed). Redirect preserves old links.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

import { redirect } from "next/navigation";

export default async function ExploreRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/view/${slug}?tab=explore`);
}
