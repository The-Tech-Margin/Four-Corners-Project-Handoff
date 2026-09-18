/**
 * GET /api/capabilities — what this deployment can do.
 *
 * The browser hides features the server cannot serve (AI transcription,
 * geocoding) instead of offering a control that fails.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { getCapabilities } from "@/lib/adapters";
import { handleRouteError, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(getCapabilities(), {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return handleRouteError(error, "Failed to read capabilities");
  }
}
