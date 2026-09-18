/**
 * Composition root: picks one adapter per port from the configuration and
 * hands them to route handlers and server components.
 *
 * Each port is built lazily, so selecting a stub for one integration never
 * constructs the others. The instances live on globalThis because Next
 * compiles server components, route handlers and the proxy into separate
 * module graphs during development.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import "server-only";
import type { AIPort } from "@/lib/ports/ai";
import type { UserAssetRepository } from "@/lib/ports/assets";
import type { AuthPort } from "@/lib/ports/auth";
import type { BlobStoragePort } from "@/lib/ports/blob-storage";
import type { EmailPort } from "@/lib/ports/email";
import type { GeocoderPort } from "@/lib/ports/geocoder";
import type { ProjectRepository } from "@/lib/ports/projects";
import type { RateLimitStore } from "@/lib/ports/rate-limit";
import type { SearchPort } from "@/lib/ports/search";
import { getConfig } from "@/lib/config/server-config";
import { createLocalAI } from "./local/ai";
import { createLocalAssetRepository } from "./local/assets";
import { createLocalAuth } from "./local/auth";
import { createLocalBlobStorage } from "./local/blob-storage";
import { createLocalEmail } from "./local/email";
import { createLocalGeocoder } from "./local/geocoder";
import { createLocalProjectRepository } from "./local/projects";
import { createLocalRateLimitStore } from "./local/rate-limit";
import { createLocalSearch } from "./local/search";
import { createStubAI } from "./stub/ai";
import { createStubAssetRepository } from "./stub/assets";
import { createStubAuth } from "./stub/auth";
import { createStubBlobStorage } from "./stub/blob-storage";
import { createStubEmail } from "./stub/email";
import { createStubGeocoder } from "./stub/geocoder";
import { createStubProjectRepository } from "./stub/projects";
import { createStubRateLimitStore } from "./stub/rate-limit";
import { createStubSearch } from "./stub/search";

export interface Services {
  readonly auth: AuthPort;
  readonly projects: ProjectRepository;
  readonly assets: UserAssetRepository;
  readonly blobs: BlobStoragePort;
  readonly search: SearchPort;
  readonly ai: AIPort;
  readonly email: EmailPort;
  readonly rateLimit: RateLimitStore;
  readonly geocoder: GeocoderPort;
}

/** What the browser is allowed to know about how this deployment is wired. */
export interface Capabilities {
  auth: { signUp: boolean; passwordReset: boolean };
  ai: { transcription: boolean; embeddings: boolean };
  search: { semantic: boolean };
  geocoding: boolean;
  emailDelivery: boolean;
  features: { exploreTab: boolean };
  limits: { galleryPerUser: number | null };
}

function build(): Services {
  const config = getConfig();
  const { adapters, dataDir } = config;

  const memo = <T>(factory: () => T): (() => T) => {
    let value: T | undefined;
    return () => (value ??= factory());
  };

  const email = memo(() =>
    adapters.email === "local" ? createLocalEmail() : createStubEmail(),
  );
  const projects = memo(() =>
    adapters.data === "local"
      ? createLocalProjectRepository(dataDir)
      : createStubProjectRepository(),
  );
  const assets = memo(() =>
    adapters.data === "local"
      ? createLocalAssetRepository(dataDir)
      : createStubAssetRepository(),
  );
  const blobs = memo(() =>
    adapters.blobs === "local" ? createLocalBlobStorage(dataDir) : createStubBlobStorage(),
  );
  const auth = memo(() =>
    adapters.auth === "local"
      ? createLocalAuth({
          dataDir,
          sessionSecret: config.sessionSecret,
          signupsEnabled: config.signupsEnabled,
          secureCookies: process.env.NODE_ENV === "production",
          email: email(),
        })
      : createStubAuth(),
  );
  const search = memo(() =>
    adapters.search === "local" ? createLocalSearch(projects()) : createStubSearch(),
  );
  const ai = memo(() => (adapters.ai === "local" ? createLocalAI() : createStubAI()));
  const geocoder = memo(() =>
    adapters.geocoder === "local" ? createLocalGeocoder() : createStubGeocoder(),
  );
  const rateLimit = memo(() =>
    adapters.rateLimit === "local" ? createLocalRateLimitStore() : createStubRateLimitStore(),
  );

  return {
    get auth() {
      return auth();
    },
    get projects() {
      return projects();
    },
    get assets() {
      return assets();
    },
    get blobs() {
      return blobs();
    },
    get search() {
      return search();
    },
    get ai() {
      return ai();
    },
    get email() {
      return email();
    },
    get rateLimit() {
      return rateLimit();
    },
    get geocoder() {
      return geocoder();
    },
  };
}

const cache = globalThis as typeof globalThis & { __fcServices?: Services };

export function getServices(): Services {
  return (cache.__fcServices ??= build());
}

export function getCapabilities(): Capabilities {
  const services = getServices();
  const config = getConfig();
  return {
    auth: services.auth.capabilities,
    ai: services.ai.capabilities,
    search: services.search.capabilities,
    geocoding: services.geocoder.capabilities.reverse,
    emailDelivery: services.email.capabilities.delivery,
    features: { exploreTab: process.env.NEXT_PUBLIC_EXPLORE_ENABLED !== "false" },
    limits: { galleryPerUser: config.galleryLimitPerUser },
  };
}
