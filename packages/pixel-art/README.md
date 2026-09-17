# Native pixel artwork

`@petlord/pixel-art` renders an editable, deterministic `NativePixelDocument` without image generation or postprocessing.

```ts
import { renderPixelFrame, validatePixelDocument, resolvePixelFrame, serializePixelDocument } from '@petlord/pixel-art';
const document = {
  schemaVersion: 1 as const,
  width: 3, height: 2,
  palette: { R: '#FF0000' },
  frames: [
    { id: 'idle', layers: [{ id: 'body', x: 0, y: 0, rows: ['.R.', 'RRR'] }] },
    { id: 'blink', baseFrameId: 'idle', patches: [{ layerId: 'body', x: 1, y: 0, rows: ['.'] }] },
  ],
};
const { width, height, rgba } = renderPixelFrame(document, 'blink');
```

Palette keys are single printable ASCII characters; values are `#RRGGBB` or `null`. `.` is always transparent and cannot be assigned an opaque color. Row cells are exact pixels. Layers paint in array order; transparent cells reveal lower layers. A derived frame inherits its base's resolved layers. A matching layer ID replaces that layer in place; a new ID appends. `visible:false` hides a layer. Every layer requires its complete rectangle, offset and rows; there is no separate offset-only override. Patches apply after layer replacements, relative to the named layer, replacing every covered cell (including transparent cells). Inputs are never mutated.

`validatePixelDocument(input)` returns `{valid, diagnostics}` with frame IDs where available. `resolvePixelFrame(document, frameId)` returns `{id,layers}` or throws for invalid documents/unknown frames. `renderPixelFrame` returns `{width,height,rgba:Uint8ClampedArray}`. `serializePixelDocument` validates and serializes a stable source: palette keys sorted, semantic frame/layer/patch array order preserved.

Limits: 256×256 canvas, 256 frames, 32 layers per source/resolved frame, 256 patches per frame, 128-character IDs, 4,194,304 total source cells, and 4,194,304 cumulative resolved cells including inherited rectangles. Rectangles must remain within the canvas/layer. Unknown colors, base frames or patch layers, duplicate frame/layer IDs, irregular rows and inheritance cycles are errors.

Runtime manifests carry native dimensions on states and explicit `{imageUri,durationMs}` frames on transitions. Native transition duration must equal the sum of frame durations; first/last URIs must equal source/target stills. Frames use 1–60,000 ms durations and at most 256 entries. Native playback repeats the entire explicit sequence with fixed/random cycle counts. It rejects partial segment settings and video `ping-pong` preprocessing mode: author the reverse sequence explicitly and use forward playback. The native backing canvas keeps original dimensions; CSS controls display scale with nearest-neighbor rendering. Loaded images with mismatched dimensions fail playback. Native completion enters the exact target still without a blend.
