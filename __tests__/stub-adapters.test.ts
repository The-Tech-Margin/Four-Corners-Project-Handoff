import { describe, it, expect } from "vitest";
import { createStubAI } from "@/lib/adapters/stub/ai";
import { createStubAssetRepository } from "@/lib/adapters/stub/assets";
import { createStubAuth } from "@/lib/adapters/stub/auth";
import { createStubBlobStorage } from "@/lib/adapters/stub/blob-storage";
import { createStubEmail } from "@/lib/adapters/stub/email";
import { createStubGeocoder } from "@/lib/adapters/stub/geocoder";
import { createStubProjectRepository } from "@/lib/adapters/stub/projects";
import { createStubRateLimitStore } from "@/lib/adapters/stub/rate-limit";
import { createStubSearch } from "@/lib/adapters/stub/search";
import { NotConfiguredError } from "@/lib/ports/errors";

const stubs: [string, object, string][] = [
  ["AuthPort", createStubAuth(), "FC_AUTH_ADAPTER"],
  ["ProjectRepository", createStubProjectRepository(), "FC_DATA_ADAPTER"],
  ["UserAssetRepository", createStubAssetRepository(), "FC_DATA_ADAPTER"],
  ["BlobStoragePort", createStubBlobStorage(), "FC_BLOB_ADAPTER"],
  ["SearchPort", createStubSearch(), "FC_SEARCH_ADAPTER"],
  ["AIPort", createStubAI(), "FC_AI_ADAPTER"],
  ["EmailPort", createStubEmail(), "FC_EMAIL_ADAPTER"],
  ["RateLimitStore", createStubRateLimitStore(), "FC_RATE_LIMIT_ADAPTER"],
  ["GeocoderPort", createStubGeocoder(), "FC_GEOCODER_ADAPTER"],
];

describe("stub adapters", () => {
  for (const [name, stub, envVar] of stubs) {
    it(`${name} tells you what to configure`, () => {
      const methods = Object.entries(stub as Record<string, unknown>).filter(
        ([, value]) => typeof value === "function",
      );
      expect(methods.length).toBeGreaterThan(0);

      for (const [method, fn] of methods) {
        let thrown: unknown;
        try {
          (fn as () => unknown)();
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${name}.${method}`).toBeInstanceOf(NotConfiguredError);
        expect((thrown as Error).message).toContain(name);
        expect((thrown as Error).message).toContain(envVar);
      }
    });
  }
});
