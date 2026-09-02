import { useEffect, useRef } from "react";

export function useInspectorScrollReset(selectionKey: string) {
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0 });
  }, [selectionKey]);
  return inspectorRef;
}
