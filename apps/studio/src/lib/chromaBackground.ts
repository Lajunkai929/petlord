export interface SampledColor {
  red: number;
  green: number;
  blue: number;
  weight?: number;
}

const backgroundCandidates = ["#00FF00", "#006CFF", "#FF00FF", "#FFFFFF"] as const;

function hexToColor(hex: string): SampledColor {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function distance(left: SampledColor, right: SampledColor) {
  return Math.hypot(left.red - right.red, left.green - right.green, left.blue - right.blue);
}

export function chooseChromaBackgroundColor(samples: SampledColor[]) {
  if (samples.length === 0) return backgroundCandidates[0];
  const scored = backgroundCandidates.map((hex, priority) => {
    const candidate = hexToColor(hex);
    const totalWeight = samples.reduce((sum, sample) => sum + (sample.weight ?? 1), 0);
    const conflictWeight = samples.reduce((sum, sample) =>
      sum + (distance(candidate, sample) < 92 ? sample.weight ?? 1 : 0), 0);
    const minimumDistance = Math.min(...samples.map((sample) => distance(candidate, sample)));
    return { hex, priority, conflictRatio: conflictWeight / Math.max(1, totalWeight), minimumDistance };
  });
  const safe = scored.filter((candidate) => candidate.conflictRatio < 0.06 && candidate.minimumDistance >= 72);
  if (safe.length > 0) return safe.sort((left, right) => left.priority - right.priority)[0]?.hex ?? backgroundCandidates[0];
  return scored.sort((left, right) =>
    left.conflictRatio - right.conflictRatio || right.minimumDistance - left.minimumDistance || left.priority - right.priority)[0]?.hex ?? backgroundCandidates[0];
}

async function sampleImage(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`无法读取形象参考图：${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const pixels = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, SampledColor & { weight: number }>();
  for (let y = 8; y < size - 8; y += 2) {
    for (let x = 8; x < size - 8; x += 2) {
      const offset = (y * size + x) * 4;
      const alpha = pixels[offset + 3] ?? 0;
      if (alpha < 96) continue;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const key = `${red >> 5}:${green >> 5}:${blue >> 5}`;
      const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, weight: 0 };
      bucket.red = (bucket.red * bucket.weight + red) / (bucket.weight + 1);
      bucket.green = (bucket.green * bucket.weight + green) / (bucket.weight + 1);
      bucket.blue = (bucket.blue * bucket.weight + blue) / (bucket.weight + 1);
      bucket.weight += 1;
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].sort((left, right) => right.weight - left.weight).slice(0, 20);
}

export async function calculateAutoChromaColor(referenceUris: string[]) {
  const sampled = await Promise.all(referenceUris.slice(0, 8).map((uri) => sampleImage(uri).catch(() => [])));
  return chooseChromaBackgroundColor(sampled.flat());
}
