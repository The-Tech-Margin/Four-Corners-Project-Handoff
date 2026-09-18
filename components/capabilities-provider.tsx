/**
 * What this deployment can do, for the UI to read. Everything starts off,
 * so a control for a missing integration never flashes into view.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_CAPABILITIES,
  fetchCapabilities,
  type Capabilities,
} from "@/lib/api-client/capabilities";

const CapabilitiesContext = createContext<Capabilities>(DEFAULT_CAPABILITIES);

export function useCapabilities(): Capabilities {
  return useContext(CapabilitiesContext);
}

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities>(DEFAULT_CAPABILITIES);

  useEffect(() => {
    let active = true;
    void fetchCapabilities()
      .then((next) => {
        if (active) setCapabilities(next);
      })
      .catch(() => {
        /* stay with everything off */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>
  );
}
