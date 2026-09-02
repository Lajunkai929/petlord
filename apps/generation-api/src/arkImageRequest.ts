export type StudioImageSize = "1K" | "2K" | "1024x1024" | "2048x2048";

/** Converts Studio-facing labels into the exact values accepted by Ark. */
export function normalizeArkImageSize(size: StudioImageSize, model?: string) {
  if (size === "1K") return model?.startsWith("doubao-seedream-5-") ? "2k" : "1024x1024";
  if (size === "2K" || size === "2048x2048") return "2k";
  return size;
}

export function normalizeArkImageRequest<T extends { size: StudioImageSize }>(request: T) {
  const model = "model" in request && typeof request.model === "string" ? request.model : undefined;
  return { ...request, size: normalizeArkImageSize(request.size, model) };
}
