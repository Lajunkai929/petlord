import { useEffect, useRef } from "react";
import type { CharacterProject } from "@petlord/schema";
import type { StudioArea, StudioSelection } from "../studioTypes";
import {
  buildStudioUrl,
  parseStudioRoute,
  resolveStudioSelection,
  type StudioRouteState,
} from "../studioRoute";

export function useStudioUrlState(input: {
  project: CharacterProject;
  activeArea: StudioArea;
  selection: StudioSelection;
  activateProject: (projectId: string) => boolean;
  setActiveArea: (area: StudioArea) => void;
  setSelection: (selection: StudioSelection) => void;
}) {
  const pendingRouteRef = useRef<StudioRouteState | null>(null);
  const suspendUrlWriteRef = useRef(false);
  const previousProjectIdRef = useRef(input.project.id);

  useEffect(() => {
    const pendingRoute = pendingRouteRef.current;
    const restoresPendingRoute = pendingRoute && (!pendingRoute.projectId || pendingRoute.projectId === input.project.id);
    if (restoresPendingRoute) {
      input.setSelection(resolveStudioSelection(input.project, pendingRoute.selection));
      input.setActiveArea(pendingRoute.area);
      pendingRouteRef.current = null;
      suspendUrlWriteRef.current = false;
    } else if (previousProjectIdRef.current !== input.project.id) {
      input.setSelection(resolveStudioSelection(input.project));
    }
    previousProjectIdRef.current = input.project.id;
  }, [input.project.id]);

  useEffect(() => {
    if (!input.selection) return;
    const isValid = input.selection.kind === "state"
      ? input.project.logicalStates.some((state) => state.id === input.selection?.id)
      : input.project.transitions.some((transition) => transition.id === input.selection?.id);
    if (!isValid) input.setSelection(resolveStudioSelection(input.project));
  }, [input.project.logicalStates, input.project.transitions, input.selection]);

  useEffect(() => {
    const restoreFromUrl = () => {
      const route = parseStudioRoute(window.location.href);
      if (route.projectId && route.projectId !== input.project.id) {
        pendingRouteRef.current = route;
        suspendUrlWriteRef.current = true;
        if (input.activateProject(route.projectId)) return;
        pendingRouteRef.current = null;
        suspendUrlWriteRef.current = false;
      }
      input.setSelection(resolveStudioSelection(input.project, route.selection));
      input.setActiveArea(route.area);
    };
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [input.project.id, input.project.logicalStates, input.project.transitions, input.activateProject, input.setActiveArea, input.setSelection]);

  useEffect(() => {
    if (suspendUrlWriteRef.current) return;
    const nextUrl = buildStudioUrl(window.location.href, {
      area: input.activeArea,
      projectId: input.project.id,
      selection: input.selection,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, "", nextUrl);
  }, [input.activeArea, input.project.id, input.selection]);
}
