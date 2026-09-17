/**
 * Database operations for project_ethics (normalized table)
 */

import type { CodeOfEthics } from "@/lib/schema";
import { createProjectTableCrud } from "./crud-factory";

export interface EthicsRecord {
  id: string;
  project_id: string;
  custom_ethics_text?: string;
  no_manipulation: boolean;
  manipulation_details?: string;
  no_staging: boolean;
  staging_details?: string;
  informed_consent: boolean;
  consent_details?: string;
  identity_protected: boolean;
  identity_protection_details?: string;
  consent_document_url?: string;
  ai_altered?: boolean;
  ai_altered_details?: string;
  created_at?: string;
  updated_at?: string;
}

const crud = createProjectTableCrud<CodeOfEthics, EthicsRecord>(
  "project_ethics",
  (projectId, ethics) => ({
    project_id: projectId,
    custom_ethics_text: ethics.customEthicsText,
    no_manipulation: ethics.noManipulation,
    manipulation_details: ethics.manipulationDetails,
    no_staging: ethics.noStaging,
    staging_details: ethics.stagingDetails,
    informed_consent: ethics.informedConsent,
    consent_details: ethics.consentDetails,
    identity_protected: ethics.identityProtected,
    identity_protection_details: ethics.identityProtectionDetails,
    consent_document_url: ethics.consentDocumentUrl,
    ai_altered: ethics.aiAltered,
    ai_altered_details: ethics.aiAlteredDetails,
  }),
);

export const upsertEthics = crud.upsert;
export const getEthics = crud.get;
export const deleteEthics = crud.delete;
