/**
 * Shared gallery utilities — grouping logic used by both
 * /api/gallery and /api/search endpoints.
 */

import type { ProjectRecord } from "@/lib/projects/types";

export interface ImageSet {
  root: ProjectRecord;
  children: ProjectRecord[];
}

/**
 * Group flat project list into parent/child ImageSets.
 * O(n) using a Map — orphaned children become standalone roots.
 */
export function groupByParentChild(projects: ProjectRecord[]): ImageSet[] {
  const childrenMap = new Map<string, ProjectRecord[]>();
  const roots: ProjectRecord[] = [];

  for (const project of projects) {
    if (project.parent_project_id) {
      const siblings = childrenMap.get(project.parent_project_id) || [];
      siblings.push(project);
      childrenMap.set(project.parent_project_id, siblings);
    } else {
      roots.push(project);
    }
  }

  const sets: ImageSet[] = [];
  const processedIds = new Set<string>();

  for (const root of roots) {
    sets.push({ root, children: childrenMap.get(root.id) || [] });
    processedIds.add(root.id);
    (childrenMap.get(root.id) || []).forEach((c) => processedIds.add(c.id));
  }

  // Orphaned children (parent not in result set) become standalone
  for (const project of projects) {
    if (!processedIds.has(project.id)) {
      sets.push({ root: project, children: [] });
    }
  }

  return sets;
}
