export interface NormalizedBackgroundColor {
  red: number;
  green: number;
  blue: number;
  count: number;
}

function colorDistance(left: NormalizedBackgroundColor, right: NormalizedBackgroundColor) {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue);
}

export function detectBackgroundPalette(
  rgb: Uint8Array,
  width: number,
  height: number,
  maxColors = 8,
): NormalizedBackgroundColor[] {
  const frameSize = width * height * 3;
  if (frameSize <= 0 || rgb.byteLength < frameSize) return [];
  const frameCount = Math.floor(rgb.byteLength / frameSize);
  const borderWidth = Math.max(2, Math.round(Math.min(width, height) * 0.12));
  const quantization = 0.02;
  const buckets = new Map<string, NormalizedBackgroundColor>();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameOffset = frame * frameSize;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= borderWidth && x < width - borderWidth && y >= borderWidth && y < height - borderWidth) continue;
        const offset = frameOffset + (y * width + x) * 3;
        const red = rgb[offset] ?? 0;
        const green = rgb[offset + 1] ?? 0;
        const blue = rgb[offset + 2] ?? 0;
        const total = red + green + blue;
        if (total < 24) continue;
        const normalized = { red: red / total, green: green / total, blue: blue / total };
        const key = [normalized.red, normalized.green, normalized.blue]
          .map((value) => Math.round(value / quantization))
          .join(":");
        const bucket = buckets.get(key) ?? { ...normalized, count: 0 };
        const nextCount = bucket.count + 1;
        bucket.red = (bucket.red * bucket.count + normalized.red) / nextCount;
        bucket.green = (bucket.green * bucket.count + normalized.green) / nextCount;
        bucket.blue = (bucket.blue * bucket.count + normalized.blue) / nextCount;
        bucket.count = nextCount;
        buckets.set(key, bucket);
      }
    }
  }

  const minimumCount = Math.max(4, Math.round(frameCount * borderWidth * 0.4));
  const candidates = [...buckets.values()]
    .filter((color) => color.count >= minimumCount)
    .sort((left, right) => right.count - left.count);
  const dominant = candidates[0];
  const palette: NormalizedBackgroundColor[] = [];
  for (const candidate of candidates) {
    if (dominant && candidate.count < dominant.count * 0.04) continue;
    if (dominant && colorDistance(dominant, candidate) > 0.05) continue;
    if (palette.every((selected) => colorDistance(selected, candidate) >= 0.025)) palette.push(candidate);
    if (palette.length >= maxColors) break;
  }
  return palette;
}

function fixed(value: number) {
  return Number(value.toFixed(5)).toString();
}

export function adaptiveAlphaExpression(
  palette: NormalizedBackgroundColor[],
  similarity: number,
) {
  if (palette.length === 0) return "255";
  const sum = "(r(X,Y)+g(X,Y)+b(X,Y)+1)";
  const distances = palette.map((color) =>
    `sqrt(pow(r(X,Y)/${sum}-${fixed(color.red)},2)+pow(g(X,Y)/${sum}-${fixed(color.green)},2)+pow(b(X,Y)/${sum}-${fixed(color.blue)},2))`);
  const minimumDistance = distances.reduce((current, distance) => `min(${current},${distance})`);
  const transparentRadius = 0.018 + similarity * 0.02;
  const featherWidth = Math.max(0.045, 0.105 - similarity * 0.08);
  const matte = `clip(255*(${minimumDistance}-${fixed(transparentRadius)})/${fixed(featherWidth)},0,255)`;
  const shadowThreshold = Math.round(100 + similarity * 90);
  return `if(lt(${matte},${shadowThreshold}),0,${matte})`;
}

export function alphaCoverage(rgba: Uint8Array) {
  if (rgba.byteLength < 4) return { transparentRatio: 0, opaqueRatio: 0 };
  let transparent = 0;
  let opaque = 0;
  const pixels = Math.floor(rgba.byteLength / 4);
  for (let offset = 3; offset < pixels * 4; offset += 4) {
    const alpha = rgba[offset] ?? 255;
    if (alpha <= 16) transparent += 1;
    if (alpha >= 239) opaque += 1;
  }
  return { transparentRatio: transparent / pixels, opaqueRatio: opaque / pixels };
}
