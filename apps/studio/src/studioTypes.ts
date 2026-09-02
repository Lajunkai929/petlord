export type StudioArea = "orders" | "identity" | "style" | "graph" | "preview" | "review" | "plugins" | "publish";

export type StudioSelection = { kind: "state" | "transition"; id: string } | null;
