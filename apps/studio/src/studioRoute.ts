import type { CharacterProject } from "@petlord/schema";
import type { StudioArea, StudioSelection } from "./studioTypes";

const pageByArea: Record<StudioArea, string> = {
  orders: "projects",
  identity: "identities",
  style: "styles",
  graph: "edit",
  preview: "preview",
  review: "review",
  plugins: "plugins",
  publish: "publish",
};

const areaByPage = new Map<string, StudioArea>([
  ...Object.entries(pageByArea).map(([area, page]) => [page, area as StudioArea] as const),
  ["orders", "orders"],
  ["identity", "identity"],
  ["style", "style"],
  ["graph", "graph"],
]);

const selectionAwareAreas = new Set<StudioArea>(["graph", "preview", "publish"]);

export interface StudioRouteState {
  area: StudioArea;
  projectId?: string;
  selection?: Exclude<StudioSelection, null>;
}

function nonEmpty(value: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parseStudioRoute(href: string): StudioRouteState {
  const url = new URL(href, "http://localhost");
  const stateId = nonEmpty(url.searchParams.get("state"));
  const transitionId = nonEmpty(url.searchParams.get("transition"));
  return {
    area: areaByPage.get(url.searchParams.get("page") ?? "") ?? "orders",
    projectId: nonEmpty(url.searchParams.get("project")),
    selection: transitionId
      ? { kind: "transition", id: transitionId }
      : stateId
        ? { kind: "state", id: stateId }
        : undefined,
  };
}

export function readStudioRoute() {
  return typeof window === "undefined"
    ? { area: "orders" as const }
    : parseStudioRoute(window.location.href);
}

export function resolveStudioSelection(project: CharacterProject, requested?: StudioRouteState["selection"]): StudioSelection {
  if (requested?.kind === "state" && project.logicalStates.some((state) => state.id === requested.id)) return requested;
  if (requested?.kind === "transition" && project.transitions.some((transition) => transition.id === requested.id)) return requested;
  const firstState = project.logicalStates[0];
  return firstState ? { kind: "state", id: firstState.id } : null;
}

export function buildStudioUrl(
  currentHref: string,
  route: { area: StudioArea; projectId: string; selection: StudioSelection },
) {
  const url = new URL(currentHref, "http://localhost");
  url.search = "";
  url.hash = "";
  url.searchParams.set("page", pageByArea[route.area]);
  url.searchParams.set("project", route.projectId);
  if (route.selection && selectionAwareAreas.has(route.area)) {
    url.searchParams.set(route.selection.kind, route.selection.id);
  }
  return `${url.pathname}${url.search}`;
}
