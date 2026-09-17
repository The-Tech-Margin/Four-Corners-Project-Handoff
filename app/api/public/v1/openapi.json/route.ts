import { NextRequest } from "next/server";
import { buildOpenAPISpec } from "@/lib/openapi-spec";
import { publicJson, publicOptions } from "@/lib/api-public-headers";

/**
 * GET /api/public/v1/openapi.json — OpenAPI 3.1 spec for Postman import.
 *
 * `servers[0].url` is built from the request origin so the spec works against
 * localhost in dev and the deployed host in production.
 */
export async function GET(request: NextRequest) {
  const spec = buildOpenAPISpec(request.nextUrl.origin);
  return publicJson(spec);
}

export async function OPTIONS() {
  return publicOptions();
}
