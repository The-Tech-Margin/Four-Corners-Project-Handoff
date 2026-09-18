/**
 * What this deployment can do, as the browser sees it. Everything defaults
 * to off so a feature never flashes on before the answer arrives.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { apiGet } from "./http";

export interface Capabilities {
  auth: { signUp: boolean; passwordReset: boolean };
  ai: { transcription: boolean; embeddings: boolean };
  search: { semantic: boolean };
  geocoding: boolean;
  emailDelivery: boolean;
  features: { exploreTab: boolean };
  limits: { galleryPerUser: number | null };
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  auth: { signUp: false, passwordReset: false },
  ai: { transcription: false, embeddings: false },
  search: { semantic: false },
  geocoding: false,
  emailDelivery: false,
  features: { exploreTab: false },
  limits: { galleryPerUser: null },
};

export const fetchCapabilities = (): Promise<Capabilities> => apiGet("/api/capabilities");
