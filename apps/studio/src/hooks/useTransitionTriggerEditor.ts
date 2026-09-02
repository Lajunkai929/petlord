import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { InteractionRegion, TransitionTrigger } from "@petlord/schema";

const defaultRegion: InteractionRegion = { shape: "ellipse", x: 0.12, y: 0.12, width: 0.76, height: 0.76 };

function isTimedEvent(event: TransitionTrigger["event"]) {
  return event === "inactivity" || event === "state-timeout";
}

function supportsRegion(event: TransitionTrigger["event"]) {
  return !isTimedEvent(event) && event !== "pointer-leave";
}

export function useTransitionTriggerEditor(
  triggers: TransitionTrigger[],
  onChange: (triggers: TransitionTrigger[]) => void,
) {
  const [activeId, setActiveId] = useState(triggers[0]?.id);
  const [drawing, setDrawing] = useState(false);
  const origin = useRef<{ x: number; y: number } | undefined>(undefined);
  const active = triggers.find((trigger) => trigger.id === activeId) ?? triggers[0];

  useEffect(() => {
    if (!triggers.some((trigger) => trigger.id === activeId)) setActiveId(triggers[0]?.id);
  }, [activeId, triggers]);

  function patch(id: string, next: Partial<TransitionTrigger>) {
    onChange(triggers.map((trigger) => trigger.id === id ? { ...trigger, ...next } : trigger));
  }

  function add(event: TransitionTrigger["event"] = "inactivity") {
    const next: TransitionTrigger = {
      id: `trigger-${crypto.randomUUID()}`,
      event,
      enabled: true,
      hoverDurationMs: event === "hover" ? 800 : undefined,
      repeatWhileHovered: event === "hover" ? false : undefined,
      timerDurationMs: isTimedEvent(event) ? 60_000 : undefined,
      region: supportsRegion(event) ? defaultRegion : undefined,
    };
    onChange([...triggers, next]);
    setActiveId(next.id);
  }

  function remove(id: string) {
    const next = triggers.filter((trigger) => trigger.id !== id);
    onChange(next);
    setActiveId(next[0]?.id);
  }

  function changeEvent(event: TransitionTrigger["event"]) {
    if (!active) return;
    patch(active.id, {
      event,
      hoverDurationMs: event === "hover" ? active.hoverDurationMs ?? 800 : undefined,
      repeatWhileHovered: event === "hover" ? active.repeatWhileHovered ?? false : undefined,
      timerDurationMs: isTimedEvent(event) ? active.timerDurationMs ?? 60_000 : undefined,
      region: supportsRegion(event) ? active.region ?? defaultRegion : undefined,
    });
  }

  function changeHoverSeconds(seconds: number) {
    if (!active || !Number.isFinite(seconds)) return;
    patch(active.id, { hoverDurationMs: Math.max(100, Math.min(30_000, Math.round(seconds * 1000))) });
  }

  function changeTimerSeconds(seconds: number) {
    if (!active || !Number.isFinite(seconds)) return;
    patch(active.id, { timerDurationMs: Math.max(1_000, Math.min(86_400_000, Math.round(seconds * 1000))) });
  }

  function changeShape(shape: InteractionRegion["shape"]) {
    if (!active || !supportsRegion(active.event)) return;
    patch(active.id, {
      region: { ...(active.region ?? { x: 0.12, y: 0.12, width: 0.76, height: 0.76 }), shape },
    });
  }

  function setEnabled(enabled: boolean) {
    if (active) patch(active.id, { enabled });
  }

  function point(event: ReactPointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function beginRegion(event: ReactPointerEvent<HTMLElement>) {
    if (!active || !supportsRegion(active.event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    origin.current = next;
    setDrawing(true);
    patch(active.id, { region: { shape: active.region?.shape ?? "ellipse", x: next.x, y: next.y, width: 0.01, height: 0.01 } });
  }

  function updateRegion(event: ReactPointerEvent<HTMLElement>) {
    if (!drawing || !origin.current || !active || !supportsRegion(active.event)) return;
    const next = point(event);
    const x = Math.min(origin.current.x, next.x);
    const y = Math.min(origin.current.y, next.y);
    patch(active.id, {
      region: {
        shape: active.region?.shape ?? "ellipse",
        x,
        y,
        width: Math.max(0.02, Math.abs(next.x - origin.current.x)),
        height: Math.max(0.02, Math.abs(next.y - origin.current.y)),
      },
    });
  }

  function endRegion(event: ReactPointerEvent<HTMLElement>) {
    if (!drawing) return;
    updateRegion(event);
    setDrawing(false);
    origin.current = undefined;
  }

  return {
    active, activeId, drawing, setActiveId, patch, add, remove,
    changeEvent, changeHoverSeconds, changeTimerSeconds, changeShape, setEnabled,
    beginRegion, updateRegion, endRegion,
  };
}
