/**
 * Generic CRUD factory for 1:1 normalized project tables.
 *
 * Every normalized table (project_backstory, project_ethics, etc.) follows
 * the same upsert/get/delete pattern keyed on `project_id`. This factory
 * eliminates ~500 lines of duplicated boilerplate by generating typed
 * functions from a table name and a camelCase→snake_case mapping function.
 */

import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;
function getDb(sb?: SupabaseClient) { return sb ?? createClient(); }

/**
 * Create typed upsert/get/delete functions for a 1:1 project table.
 *
 * @param tableName  — Supabase table name (e.g. "project_backstory")
 * @param toRecord   — Maps domain type to DB row. Receives projectId + data.
 *                     Return value is spread into the upsert payload.
 */
export function createProjectTableCrud<TDomain, TRecord>(
  tableName: string,
  toRecord: (projectId: string, data: TDomain) => Record<string, unknown>,
) {
  async function upsert(
    projectId: string,
    data: TDomain | undefined,
    sb?: SupabaseClient,
  ): Promise<TRecord | null> {
    if (!data) return null;

    const supabase = getDb(sb);
    const record = toRecord(projectId, data);

    const { data: result, error } = await supabase
      .from(tableName)
      .upsert(record, { onConflict: "project_id" })
      .select()
      .single();

    if (error) throw error;
    return result as TRecord;
  }

  async function get(
    projectId: string,
    sb?: SupabaseClient,
  ): Promise<TRecord | null> {
    const supabase = getDb(sb);

    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) throw error;
    return data as TRecord | null;
  }

  async function remove(
    projectId: string,
    sb?: SupabaseClient,
  ): Promise<void> {
    const supabase = getDb(sb);

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("project_id", projectId);

    if (error) throw error;
  }

  return { upsert, get, delete: remove };
}
