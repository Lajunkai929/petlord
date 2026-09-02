// A 10-colour palette was too aggressive for dark-coated animals: black fur,
// charcoal eye masks, pupils and warm irises were frequently collapsed into the
// same swatch. Sixteen colours is still a deliberately small sprite palette,
// while leaving enough tonal anchors for readable facial features.
export const pixelArtPaletteSize = 16;
export type PixelColor = readonly [number, number, number];

export function pixelArtGridSize(renderResolution: number, requestedGridSize?: number) {
  const preferred = requestedGridSize ?? Math.round(renderResolution / 2);
  return Math.max(16, Math.min(renderResolution, preferred));
}

function colorDistance(red: number, green: number, blue: number, color: PixelColor) {
  const redMean = (red + color[0]) / 2;
  const redDelta = red - color[0];
  const greenDelta = green - color[1];
  const blueDelta = blue - color[2];
  return (2 + redMean / 256) * redDelta ** 2 + 4 * greenDelta ** 2 + (2 + (255 - redMean) / 256) * blueDelta ** 2;
}

function luminance(color: PixelColor) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

type HistogramColor = { color: PixelColor; count: number };

function colorHistogram(source: Uint8ClampedArray, alphaThreshold: number) {
  const buckets = new Map<number, { red: number; green: number; blue: number; count: number }>();
  for (let index = 0; index < source.length; index += 4) {
    if (source[index + 3] < alphaThreshold) continue;
    const key = (source[index] >> 3) << 10 | (source[index + 1] >> 3) << 5 | source[index + 2] >> 3;
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += source[index];
    bucket.green += source[index + 1];
    bucket.blue += source[index + 2];
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(({ red, green, blue, count }): HistogramColor => ({
    color: [Math.round(red / count), Math.round(green / count), Math.round(blue / count)],
    count,
  }));
}

export function buildStablePixelPalette(source: Uint8ClampedArray, maximumColors = pixelArtPaletteSize, alphaThreshold = 72): PixelColor[] {
  const histogram = colorHistogram(source, alphaThreshold);
  if (histogram.length === 0) return [[36, 31, 27]];
  if (histogram.length <= maximumColors) return histogram.map((entry) => entry.color).sort((left, right) => luminance(left) - luminance(right));
  const sorted = histogram.slice().sort((left, right) => luminance(left.color) - luminance(right.color));
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.count, 0);
  const centers: PixelColor[] = [];
  for (let seed = 0; seed < maximumColors; seed += 1) {
    const targetWeight = totalWeight * (seed + 0.5) / maximumColors;
    let accumulated = 0;
    const entry = sorted.find((candidate) => (accumulated += candidate.count) >= targetWeight) ?? sorted.at(-1)!;
    centers.push(entry.color);
  }
  centers[0] = sorted[0].color;
  centers[centers.length - 1] = sorted[sorted.length - 1].color;
  if (centers.length > 3) {
    const darkestLuminance = luminance(sorted[0].color);
    const darkStructure = sorted.find((entry) => luminance(entry.color) >= darkestLuminance + 14 && luminance(entry.color) <= 105);
    if (darkStructure) centers[1] = darkStructure.color;
  }
  const saturation = (entry: HistogramColor) => Math.max(...entry.color) - Math.min(...entry.color);
  const saturated = histogram.slice().sort((left, right) => saturation(right) - saturation(left) || right.count - left.count)[0]?.color;
  if (saturated) centers[Math.max(2, centers.length - 2)] = saturated;
  const anchoredCenters = new Set([0, 1, centers.length - 1, Math.max(2, centers.length - 2)]);

  for (let iteration = 0; iteration < 7; iteration += 1) {
    const sums = centers.map(() => ({ red: 0, green: 0, blue: 0, count: 0 }));
    for (const entry of histogram) {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = colorDistance(entry.color[0], entry.color[1], entry.color[2], center);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      sums[nearest].red += entry.color[0] * entry.count;
      sums[nearest].green += entry.color[1] * entry.count;
      sums[nearest].blue += entry.color[2] * entry.count;
      sums[nearest].count += entry.count;
    }
    centers.forEach((center, index) => {
      const sum = sums[index];
      if (sum.count > 0 && !anchoredCenters.has(index)) centers[index] = [Math.round(sum.red / sum.count), Math.round(sum.green / sum.count), Math.round(sum.blue / sum.count)];
      else centers[index] = center;
    });
  }
  return centers
    .filter((color, index) => centers.findIndex((candidate) => colorDistance(color[0], color[1], color[2], candidate) < 80) === index)
    .sort((left, right) => luminance(left) - luminance(right));
}

function sharpenPixelDetails(source: Uint8ClampedArray, width: number, height: number) {
  const output = new Uint8ClampedArray(source);
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 72) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let count = 0;
        for (const [offsetX, offsetY] of neighbors) {
          const neighbor = ((y + offsetY) * width + x + offsetX) * 4;
          if (source[neighbor + 3] < 72) continue;
          sum += source[neighbor + channel];
          count += 1;
        }
        if (count > 0) output[index + channel] = Math.max(0, Math.min(255, Math.round(source[index + channel] + (source[index + channel] - sum / count) * 0.72)));
      }
    }
  }
  return output;
}

function expandDarkFeatureContrast(source: Uint8ClampedArray) {
  let visible = 0;
  let dark = 0;
  let deepDark = 0;
  for (let index = 0; index < source.length; index += 4) {
    if (source[index + 3] < 72) continue;
    visible += 1;
    const light = 0.2126 * source[index] + 0.7152 * source[index + 1] + 0.0722 * source[index + 2];
    if (light < 96) dark += 1;
    if (light < 38) deepDark += 1;
  }
  if (visible === 0 || dark / visible < 0.28 || deepDark / visible < 0.025) return source;
  const output = new Uint8ClampedArray(source);
  for (let index = 0; index < output.length; index += 4) {
    if (output[index + 3] < 72) continue;
    const light = 0.2126 * output[index] + 0.7152 * output[index + 1] + 0.0722 * output[index + 2];
    if (light <= 0 || light >= 112) continue;
    const target = light < 24 ? light * 0.78 : Math.min(128, 24 + (light - 24) * 1.38);
    const scale = target / light;
    output[index] = Math.min(255, Math.round(output[index] * scale));
    output[index + 1] = Math.min(255, Math.round(output[index + 1] * scale));
    output[index + 2] = Math.min(255, Math.round(output[index + 2] * scale));
  }
  return output;
}

export function renderPixelArtPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  options: { alphaThreshold?: number; outline?: boolean; palette?: PixelColor[]; previousIndices?: Uint8Array } = {},
) {
  const alphaThreshold = options.alphaThreshold ?? 72;
  const sharpened = expandDarkFeatureContrast(sharpenPixelDetails(source, width, height));
  const palette = options.palette?.length ? options.palette : buildStablePixelPalette(sharpened, pixelArtPaletteSize, alphaThreshold);
  const output = new Uint8ClampedArray(sharpened.length);
  const indices = new Uint8Array(width * height).fill(255);
  const opaque = new Uint8Array(width * height);
  let hasTransparency = false;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const previous = options.previousIndices?.[pixel];
    const wasVisible = previous !== undefined && previous < palette.length;
    const visibilityThreshold = wasVisible ? Math.max(24, alphaThreshold - 24) : Math.min(240, alphaThreshold + 16);
    const visible = sharpened[index + 3] >= visibilityThreshold;
    opaque[pixel] = visible ? 1 : 0;
    hasTransparency ||= !visible;
    if (!visible) continue;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    palette.forEach((color, paletteIndex) => {
      const distance = colorDistance(sharpened[index], sharpened[index + 1], sharpened[index + 2], color);
      if (distance < nearestDistance) {
        nearest = paletteIndex;
        nearestDistance = distance;
      }
    });
    if (previous !== undefined && previous < palette.length) {
      const previousDistance = colorDistance(sharpened[index], sharpened[index + 1], sharpened[index + 2], palette[previous]);
      if (previousDistance <= nearestDistance + 520) nearest = previous;
    }
    indices[pixel] = nearest;
  }

  const spatiallyStable = new Uint8Array(indices);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const current = indices[pixel];
      if (current >= palette.length) continue;
      const counts = new Uint8Array(palette.length);
      let sameColorNeighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const neighbor = indices[(y + offsetY) * width + x + offsetX];
          if (neighbor >= palette.length) continue;
          counts[neighbor] += 1;
          if (neighbor === current) sameColorNeighbors += 1;
        }
      }
      if (sameColorNeighbors > 0) continue;
      let majority = current;
      let majorityCount = 0;
      counts.forEach((count, paletteIndex) => {
        if (count > majorityCount) {
          majority = paletteIndex;
          majorityCount = count;
        }
      });
      if (majorityCount < 4 || majority === current) continue;
      const currentColor = palette[current];
      const majorityColor = palette[majority];
      if (colorDistance(currentColor[0], currentColor[1], currentColor[2], majorityColor) < 4200) spatiallyStable[pixel] = majority;
    }
  }
  indices.set(spatiallyStable);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const paletteIndex = indices[pixel];
    if (paletteIndex >= palette.length) continue;
    output.set([...palette[paletteIndex], 255], pixel * 4);
  }

  if (options.outline !== false && hasTransparency) {
    const darkest = palette[0] ?? [36, 31, 27];
    const outline: PixelColor = [Math.max(18, Math.round(darkest[0] * 0.58)), Math.max(16, Math.round(darkest[1] * 0.58)), Math.max(14, Math.round(darkest[2] * 0.58))];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (opaque[pixel]) continue;
        let touchesSubject = false;
        for (let offsetY = -1; offsetY <= 1 && !touchesSubject; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const neighborX = x + offsetX;
            const neighborY = y + offsetY;
            if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
            if (opaque[neighborY * width + neighborX]) {
              touchesSubject = true;
              break;
            }
          }
        }
        if (touchesSubject) output.set([...outline, 255], pixel * 4);
      }
    }
  }
  return { pixels: output, indices, palette };
}

export function quantizePixelArtPixels(source: Uint8ClampedArray, width: number, height: number) {
  return renderPixelArtPixels(source, width, height).pixels;
}

interface PixelArtSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  palette?: PixelColor[];
  previousIndices?: Uint8Array;
  profileKey?: string;
}

const surfaces = new WeakMap<HTMLCanvasElement, PixelArtSurface>();

function surfaceFor(canvas: HTMLCanvasElement, size: number, profileKey?: string) {
  let surface = surfaces.get(canvas);
  if (!surface) {
    const lowResolutionCanvas = document.createElement("canvas");
    const context = lowResolutionCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    surface = { canvas: lowResolutionCanvas, context, profileKey };
    surfaces.set(canvas, surface);
  }
  if (surface.canvas.width !== size || surface.canvas.height !== size || surface.profileKey !== profileKey) {
    surface.canvas.width = size;
    surface.canvas.height = size;
    surface.palette = undefined;
    surface.previousIndices = undefined;
    surface.profileKey = profileKey;
  }
  return surface;
}

export function applyPixelArtPostprocess(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  renderResolution: number,
  options: { gridSize?: number; profileKey?: string } = {},
) {
  if (typeof document === "undefined") return;
  const gridSize = pixelArtGridSize(renderResolution, options.gridSize);
  const surface = surfaceFor(canvas, gridSize, options.profileKey);
  if (!surface) return;
  surface.context.clearRect(0, 0, gridSize, gridSize);
  // The source may already be pixel art. Bilinear sampling here used to blend
  // neighbouring eye/pupil pixels before palette quantisation, effectively
  // applying a second destructive "mosaic" pass. Nearest sampling keeps the
  // authored pixel clusters intact and is stable from frame to frame.
  surface.context.imageSmoothingEnabled = false;
  surface.context.drawImage(canvas, 0, 0, gridSize, gridSize);
  const frame = surface.context.getImageData(0, 0, gridSize, gridSize);
  const rendered = renderPixelArtPixels(frame.data, gridSize, gridSize, {
    palette: surface.palette,
    previousIndices: surface.previousIndices,
  });
  surface.palette = rendered.palette;
  surface.previousIndices = rendered.indices;
  frame.data.set(rendered.pixels);
  surface.context.putImageData(frame, 0, 0);
  context.save();
  context.clearRect(0, 0, renderResolution, renderResolution);
  context.imageSmoothingEnabled = false;
  context.drawImage(surface.canvas, 0, 0, renderResolution, renderResolution);
  context.restore();
}
