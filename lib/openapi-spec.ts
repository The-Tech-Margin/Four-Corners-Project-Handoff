/**
 * OpenAPI 3.1 spec for the Four Corners public API.
 *
 * Schemas mirror the Zod definitions in lib/field-registry.ts.
 * Generated as a static object so external tools can import it via URL.
 */

import { GENERATOR } from "./attribution";

export function buildOpenAPISpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Four Corners Public Gallery API",
      version: "1.0.0",
      description:
        "Read-only API exposing the Four Corners public gallery. " +
        "Projects are returned only when `published = true AND in_gallery = true`. " +
        "Routes are organised around the four corners of a 4C project: " +
        "Context (UL), Links (UR), Backstory (BL), and Ethics & Rights (BR).\n\n" +
        "**Authentication is optional.** All endpoints work without a key. " +
        "Supplying a valid `Authorization: Bearer <API_KEY>` header raises the " +
        "rate limit from 100 to 1000 requests/minute. Anonymous callers are " +
        "limited per-IP; keyed callers per-key. Exceeding the limit returns " +
        "`429` with `Retry-After` and `X-RateLimit-*` headers.\n\n" +
        "Import this document into any OpenAPI 3.1 client to explore the API.",
      license: { name: "MIT" },
      "x-generator": GENERATOR,
    },
    servers: [{ url: baseUrl, description: "Current host" }],
    security: [{}, { bearerAuth: [] }],
    tags: [
      { name: "Discovery", description: "API index + OpenAPI spec." },
      { name: "Gallery", description: "Public gallery feed (paginated)." },
      { name: "Project", description: "Single-project resource + corners." },
      { name: "Corners", description: "The four corners of a project." },
      { name: "Cross-cutting", description: "Location, EXIF, voice transcriptions." },
      { name: "IIIF", description: "IIIF Presentation 3.0 manifest." },
    ],
    paths: {
      "/api/public/v1/": {
        get: {
          tags: ["Discovery"],
          summary: "API index",
          description: "Lists every endpoint with a short description.",
          responses: {
            "200": {
              description: "Index",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ApiIndex" } } },
            },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/openapi.json": {
        get: {
          tags: ["Discovery"],
          summary: "OpenAPI 3.1 spec",
          description: "This document. Import into Postman via Import → Link.",
          responses: {
            "200": { description: "OpenAPI document" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/gallery": {
        get: {
          tags: ["Gallery"],
          summary: "Paginated gallery feed",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
            {
              name: "sort",
              in: "query",
              schema: { type: "string", enum: ["newest", "oldest", "random"], default: "newest" },
            },
            { name: "tag", in: "query", schema: { type: "string" }, description: "Filter to projects with this tag." },
          ],
          responses: {
            "200": {
              description: "Gallery image sets grouped by parent/child.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/GalleryResponse" } } },
            },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}": {
        get: {
          tags: ["Project"],
          summary: "Full project (all four corners + cross-cutting)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Project",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/children": {
        get: {
          tags: ["Project"],
          summary: "Daisy-chained child projects",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Children of this project (same parent_project_id).",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Project" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/context": {
        get: {
          tags: ["Corners"],
          summary: "Upper-Left corner — Context (related imagery)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Array of context items.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/ContextItem" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/links": {
        get: {
          tags: ["Corners"],
          summary: "Upper-Right corner — Links (external references)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Array of link references.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Link" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/backstory": {
        get: {
          tags: ["Corners"],
          summary: "Bottom-Left corner — Backstory (photographer narrative)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Backstory object.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BackStory" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/ethics": {
        get: {
          tags: ["Corners"],
          summary: "Bottom-Right corner — Ethics & Rights (CC + ethics + photographer)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Bundled creative commons, ethics, and photographer info.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      creativeCommons: { $ref: "#/components/schemas/CreativeCommons" },
                      ethics: { $ref: "#/components/schemas/Ethics" },
                      photographerInfo: { $ref: "#/components/schemas/PhotographerInfo" },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/location": {
        get: {
          tags: ["Cross-cutting"],
          summary: "Geographic location (with PostGIS lat/lon + address)",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Location object.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Location" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/photo-metadata": {
        get: {
          tags: ["Cross-cutting"],
          summary: "EXIF / camera metadata",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Photo metadata object.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PhotoMetadata" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/voice-transcriptions": {
        get: {
          tags: ["Cross-cutting"],
          summary: "Voice recordings and their transcriptions",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": {
              description: "Array of voice transcriptions.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/VoiceTranscription" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
      "/api/public/v1/projects/{slug}/iiif": {
        get: {
          tags: ["IIIF"],
          summary: "IIIF Presentation 3.0 manifest",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": { description: "IIIF v3 manifest (JSON)." },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/TooManyRequests" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Optional public API key. Unlocks the higher rate-limit tier " +
            "(1000 req/min per key vs. 100 req/min per IP).",
        },
      },
      parameters: {
        Slug: {
          name: "slug",
          in: "path",
          required: true,
          description: "Project slug (URL-safe identifier).",
          schema: { type: "string" },
        },
      },
      responses: {
        NotFound: {
          description: "Project not found, or not currently in the public gallery.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        TooManyRequests: {
          description:
            "Rate limit exceeded. Includes `Retry-After` and `X-RateLimit-*` headers. " +
            "Send a valid Bearer API key to raise the limit.",
          headers: {
            "Retry-After": {
              description: "Seconds until the window resets.",
              schema: { type: "integer" },
            },
            "X-RateLimit-Limit": {
              description: "Requests allowed per window for the active tier.",
              schema: { type: "integer" },
            },
            "X-RateLimit-Remaining": {
              description: "Requests remaining in the current window.",
              schema: { type: "integer" },
            },
            "X-RateLimit-Reset": {
              description: "ISO-8601 timestamp when the window resets.",
              schema: { type: "string" },
            },
          },
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
        ListMeta: {
          type: "object",
          properties: {
            limit: { type: "integer" },
            offset: { type: "integer" },
            count: { type: "integer", description: "Number of items in this response page." },
          },
        },
        ApiIndex: {
          type: "object",
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            description: { type: "string" },
            endpoints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  method: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
            openapi: { type: "string", description: "URL of the OpenAPI spec." },
          },
        },
        BackStory: {
          type: "object",
          properties: {
            text: { type: "string", description: "Photographer's narrative." },
            author: { type: "string" },
            publication: { type: "string" },
            publicationUrl: { type: "string" },
            date: { type: "string", description: "Capture date (ISO)." },
          },
        },
        Link: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            source: { type: "string" },
          },
        },
        ContextItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            sourceType: { type: "string", enum: ["upload", "url"] },
            type: { type: "string", enum: ["image", "video"] },
            caption: { type: "string" },
            credit: { type: "string" },
            description: { type: "string" },
            date: { type: "string" },
            filename: { type: "string" },
            mimeType: { type: "string" },
            url: { type: "string" },
            storage_url: { type: "string" },
            thumbnail_storage_url: { type: "string" },
            audioStorageUrl: { type: "string" },
            audioDuration: { type: "number" },
            audioMimeType: { type: "string" },
            linkedProjectSlug: { type: "string" },
          },
        },
        CreativeCommons: {
          type: "object",
          properties: {
            copyright: { type: "string", description: "Copyright statement (e.g. 'CC BY 4.0')." },
            description: { type: "string" },
          },
        },
        Ethics: {
          type: "object",
          properties: {
            customEthicsText: { type: "string" },
            noManipulation: { type: "boolean" },
            manipulationDetails: { type: "string" },
            noStaging: { type: "boolean" },
            stagingDetails: { type: "string" },
            informedConsent: { type: "boolean" },
            consentDetails: { type: "string" },
            identityProtected: { type: "boolean" },
            identityProtectionDetails: { type: "string" },
            consentDocumentUrl: { type: "string" },
            aiAltered: { type: "boolean" },
            aiAlteredDetails: { type: "string" },
          },
        },
        PhotographerInfo: {
          type: "object",
          properties: {
            bio: { type: "string" },
            contact: { type: "string" },
            website: { type: "string" },
            collaborators: { type: "string" },
          },
        },
        Location: {
          type: "object",
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
            city: { type: "string" },
            state: { type: "string" },
            country: { type: "string" },
            formattedLocation: { type: "string" },
            capturedAt: { type: "string" },
            source: { type: "string", enum: ["exif", "device", "manual"] },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                street2: { type: "string" },
                city: { type: "string" },
                district: { type: "string" },
                stateProvince: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
              },
            },
          },
        },
        PhotoMetadata: {
          type: "object",
          properties: {
            dateTaken: { type: "string" },
            equipment: {
              type: "object",
              properties: {
                cameraMake: { type: "string" },
                cameraModel: { type: "string" },
                lensModel: { type: "string" },
                focalLength: { type: "string" },
                iso: { type: "string" },
                aperture: { type: "string" },
                shutterSpeed: { type: "string" },
              },
            },
            image: {
              type: "object",
              properties: {
                width: { type: "integer" },
                height: { type: "integer" },
                orientation: { type: "integer" },
              },
            },
            device: {
              type: "object",
              properties: {
                software: { type: "string" },
                hostComputer: { type: "string" },
                artist: { type: "string" },
                copyright: { type: "string" },
                userComment: { type: "string" },
                imageDescription: { type: "string" },
              },
            },
          },
        },
        VoiceTranscription: {
          type: "object",
          properties: {
            id: { type: "string" },
            recordingId: { type: "string" },
            text: { type: "string" },
            transcribedAt: { type: "string" },
            fieldId: { type: "string" },
            audioStorageUrl: { type: "string" },
            mimeType: { type: "string" },
            duration: { type: "number" },
          },
        },
        Project: {
          type: "object",
          required: ["id", "published", "in_gallery"],
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            title: { type: "string" },
            author: { type: "string" },
            date: { type: "string" },
            main_image_url: { type: "string" },
            main_image_thumbnail_url: { type: "string" },
            published: { type: "boolean" },
            in_gallery: { type: "boolean" },
            parent_project_id: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            created_at: { type: "string" },
            updated_at: { type: "string" },
            metadata: {
              type: "object",
              description: "Four Corners metadata bundle.",
              properties: {
                backStory: { $ref: "#/components/schemas/BackStory" },
                context: { type: "array", items: { $ref: "#/components/schemas/ContextItem" } },
                links: { type: "array", items: { $ref: "#/components/schemas/Link" } },
                creativeCommons: { $ref: "#/components/schemas/CreativeCommons" },
                ethics: { $ref: "#/components/schemas/Ethics" },
                photographerInfo: { $ref: "#/components/schemas/PhotographerInfo" },
                location: { $ref: "#/components/schemas/Location" },
                photoMetadata: { $ref: "#/components/schemas/PhotoMetadata" },
                voiceTranscriptions: { type: "array", items: { $ref: "#/components/schemas/VoiceTranscription" } },
              },
            },
          },
        },
        GalleryImageSet: {
          type: "object",
          properties: {
            root: { $ref: "#/components/schemas/Project" },
            children: { type: "array", items: { $ref: "#/components/schemas/Project" } },
          },
        },
        GalleryResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/GalleryImageSet" } },
            meta: { $ref: "#/components/schemas/ListMeta" },
          },
        },
      },
    },
  } as const;
}

export type OpenAPISpec = ReturnType<typeof buildOpenAPISpec>;
