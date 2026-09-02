export const runtimeFrameRateOptions = [12, 18, 24, 30, 60] as const;
export const runtimeResolutionOptions = [64, 80, 96, 128, 160, 256, 384, 480, 720, 1024] as const;
export const runtimePixelGridOptions = [24, 32, 40, 48, 64, 80, 96] as const;
export const runtimeDisplaySizeOptions = [160, 192, 200, 240, 256, 280, 288, 320, 384, 400, 480] as const;

export type RuntimeFrameRate = typeof runtimeFrameRateOptions[number];
export type RuntimeRenderResolution = typeof runtimeResolutionOptions[number];
export type RuntimePixelGridSize = typeof runtimePixelGridOptions[number];
export type RuntimeDisplaySize = typeof runtimeDisplaySizeOptions[number];
