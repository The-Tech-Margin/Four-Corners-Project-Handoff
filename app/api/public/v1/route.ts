import { NextRequest } from "next/server";
import { publicJson, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1 — API index.
 *
 * Human-friendly listing of every endpoint. Points to /openapi.json for the
 * machine-readable Postman-importable schema.
 */
export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;

  return publicJson({
    name: "Four Corners Public Gallery API",
    version: "1.0.0",
    description:
      "Read-only API for the public 4C gallery. Each project is exposed via its 4 corners " +
      "(Context, Links, Backstory, Ethics & Rights) plus cross-cutting metadata.",
    openapi: `${baseUrl}/api/public/v1/openapi.json`,
    endpoints: [
      { method: "GET", path: "/api/public/v1/", description: "This index." },
      { method: "GET", path: "/api/public/v1/openapi.json", description: "OpenAPI 3.1 spec (Postman-importable)." },
      { method: "GET", path: "/api/public/v1/gallery", description: "Paginated gallery feed." },
      { method: "GET", path: "/api/public/v1/projects/{slug}", description: "Full project (all corners)." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/children", description: "Daisy-chained children." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/context", description: "UL — Context (related imagery)." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/links", description: "UR — Links (references)." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/backstory", description: "BL — Backstory." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/ethics", description: "BR — Ethics & Rights." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/location", description: "Cross-cutting — location." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/photo-metadata", description: "Cross-cutting — EXIF / camera." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/voice-transcriptions", description: "Cross-cutting — voice recordings." },
      { method: "GET", path: "/api/public/v1/projects/{slug}/iiif", description: "IIIF Presentation 3.0 manifest." },
    ],
  });
}

export async function OPTIONS() {
  return publicOptions();
}
