import { recordRoute, type EntityType } from "@/db/search-index";

/**
 * Where a `[record:entity:id]` reference from the agent opens. The vocabulary
 * the tools emit is slightly wider than the search index's (`retest_schedule`,
 * `lab_result` without its panel), so the few extra names are folded onto the
 * palette's routing rather than maintaining a second map. Anything unknown
 * lands on the timeline, which shows every record kind.
 */
const ALIASES: Record<string, EntityType> = {
  retest_schedule: "retest",
  imaging_record: "imaging",
  symptom_log: "symptom",
};

/** The palette's entity type for an agent ref — drives the `search.types.*` label. */
export function recordLinkType(entityType: string): EntityType {
  return ALIASES[entityType] ?? (entityType as EntityType);
}

export function recordLinkHref(entityType: string, entityId: number): string {
  const type = recordLinkType(entityType);
  if (type === "lab_result") return "/labs";
  const route = recordRoute(type, entityId);
  return route === "/" ? "/timeline" : route;
}
