/**
 * GET /api/geocode/reverse?lat=&lon= — turn coordinates into a place name.
 *
 * Runs server-side so no third-party geocoder sees a visitor's IP, and
 * returns 501 when the deployment has no geocoder wired.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import type { NextRequest } from "next/server";
import { getServices } from "@/lib/adapters";
import { errorResponse, handleRouteError, json, unauthorized } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return unauthorized();

    const { searchParams } = request.nextUrl;
    const latitude = Number(searchParams.get("lat"));
    const longitude = Number(searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return errorResponse("lat and lon are required", 400);
    }

    const geocoder = getServices().geocoder;
    if (!geocoder.capabilities.reverse) {
      return errorResponse("Reverse geocoding is not configured", 501, "CAPABILITY_UNAVAILABLE");
    }

    return json({ location: await geocoder.reverse(latitude, longitude) });
  } catch (error) {
    return handleRouteError(error, "Reverse geocoding failed");
  }
}
