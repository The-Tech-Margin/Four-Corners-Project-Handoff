"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listUserAssets,
  type ListUserAssetsOptions,
} from "@/lib/db/user-assets";
import { getVoiceRecordingSignedUrl } from "@/lib/supabase-voice-storage";
import type { UserAsset, UserAssetMediaType } from "@/lib/field-registry";

export interface UseUserAssetsOptions {
  query?: string;
  mediaTypes?: UserAssetMediaType[];
  sort?: "newest" | "oldest";
  /** Page size for pagination. Defaults to 40. */
  pageSize?: number;
  /** Disable the hook (e.g. when the library modal is closed). */
  enabled?: boolean;
}

export interface UseUserAssetsResult {
  assets: UserAsset[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/** Debounce a value so rapid changes don't thrash the DB. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Refresh voice-recording signed URLs that are missing. The library renders
 * audio assets from signed URLs that can expire; re-sign on demand.
 */
async function resolveAudioUrls(assets: UserAsset[]): Promise<UserAsset[]> {
  const needs = assets.filter((a) => a.mediaType === "audio" && !a.storageUrl);
  if (needs.length === 0) return assets;
  const resigned = new Map<string, string>();
  await Promise.all(
    needs.map(async (a) => {
      const url = await getVoiceRecordingSignedUrl(a.storagePath);
      if (url) resigned.set(a.id, url);
    }),
  );
  return assets.map((a) =>
    resigned.has(a.id) ? { ...a, storageUrl: resigned.get(a.id)! } : a,
  );
}

export function useUserAssets(
  opts: UseUserAssetsOptions = {},
): UseUserAssetsResult {
  const {
    query = "",
    mediaTypes,
    sort = "newest",
    pageSize = 40,
    enabled = true,
  } = opts;

  const debouncedQuery = useDebouncedValue(query, 300);
  // Stable string identity for the filter combination. Also used as a cancel
  // key: any in-flight fetch whose filterKey doesn't match the current one is
  // discarded when it lands.
  const mediaTypesKey = (mediaTypes ?? []).slice().sort().join(",");
  const filterKey = `${debouncedQuery}|${mediaTypesKey}|${sort}`;

  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // In-flight fetch id — increment on each new fetch, compare on land.
  const reqIdRef = useRef(0);
  // Current filter key — read inside fetchPage so late responses whose filters
  // have moved on can be discarded.
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;

  const fetchPage = useCallback(
    async (
      pageOffset: number,
      append: boolean,
      // Snapshot of the filter state at call time. Captured explicitly so this
      // function works without depending on ambient closure state.
      snap: {
        query: string;
        mediaTypes: UserAssetMediaType[] | undefined;
        sort: "newest" | "oldest";
        pageSize: number;
        filterKey: string;
      },
    ) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);

      const listOpts: ListUserAssetsOptions = {
        query: snap.query || undefined,
        mediaTypes: snap.mediaTypes,
        sort: snap.sort,
        limit: snap.pageSize,
        offset: pageOffset,
      };

      try {
        const result = await listUserAssets(listOpts);
        // Discard if a newer fetch has started OR the filters have changed.
        if (reqId !== reqIdRef.current) return;
        if (snap.filterKey !== filterKeyRef.current) return;

        const resolved = await resolveAudioUrls(result.assets);
        if (reqId !== reqIdRef.current) return;
        if (snap.filterKey !== filterKeyRef.current) return;

        setAssets((prev) => {
          if (!append) return resolved;
          // IntersectionObserver can fire loadMore multiple times before the
          // first page lands — de-dupe by id so React never sees a dup key.
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...resolved.filter((a) => !seen.has(a.id))];
        });
        setHasMore(result.hasMore);
        setOffset(pageOffset + resolved.length);
      } catch (e) {
        if (reqId === reqIdRef.current) {
          setError(e instanceof Error ? e.message : "Failed to load assets");
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    // fetchPage has no captured deps — every input is passed in via `snap`.
    [],
  );

  // Reset + first-page fetch on filter change / enable.
  useEffect(() => {
    if (!enabled) {
      setAssets([]);
      setOffset(0);
      setHasMore(false);
      return;
    }
    setOffset(0);
    void fetchPage(0, false, {
      query: debouncedQuery,
      mediaTypes,
      sort,
      pageSize,
      filterKey,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, enabled]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    void fetchPage(offset, true, {
      query: debouncedQuery,
      mediaTypes,
      sort,
      pageSize,
      filterKey,
    });
  }, [
    hasMore,
    loading,
    offset,
    fetchPage,
    debouncedQuery,
    mediaTypes,
    sort,
    pageSize,
    filterKey,
  ]);

  const refetch = useCallback(() => {
    void fetchPage(0, false, {
      query: debouncedQuery,
      mediaTypes,
      sort,
      pageSize,
      filterKey,
    });
  }, [fetchPage, debouncedQuery, mediaTypes, sort, pageSize, filterKey]);

  return { assets, loading, error, hasMore, loadMore, refetch };
}
