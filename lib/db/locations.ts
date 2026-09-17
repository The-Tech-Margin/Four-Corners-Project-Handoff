/**
 * Database operations for project_locations (normalized table)
 * The DB trigger auto-populates the PostGIS `coordinates` column from lat/lon.
 */

import type { LocationData } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface LocationRecord {
  id: string;
  project_id: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  country?: string;
  formatted_location?: string;
  captured_at?: string;
  source?: string;
  street?: string;
  street2?: string;
  address_city?: string;
  district?: string;
  state_province?: string;
  postal_code?: string;
  address_country?: string;
  created_at?: string;
  updated_at?: string;
}

const crud = createProjectTableCrud<LocationData, LocationRecord>(
  "project_locations",
  (projectId, location) => {
    const record: Record<string, unknown> = {
      project_id: projectId,
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city,
      state: location.state,
      country: location.country,
      formatted_location: location.formattedLocation,
      captured_at: location.capturedAt,
      source: location.source,
    };

    if (location.address) {
      record.street = location.address.street;
      record.street2 = location.address.street2;
      record.address_city = location.address.city;
      record.district = location.address.district;
      record.state_province = location.address.stateProvince;
      record.postal_code = location.address.postalCode;
      record.address_country = location.address.country;
    }

    return record;
  },
);

export const upsertLocation = crud.upsert;
export const getLocation = crud.get;
export const deleteLocation = crud.delete;
