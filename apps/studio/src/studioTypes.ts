export type StudioArea = "orders" | "identity" | "style" | "graph" | "drawing" | "preview" | "review" | "plugins" | "publish" | "providers";

export type StudioSelection = { kind: "state" | "transition"; id: string } | null;
