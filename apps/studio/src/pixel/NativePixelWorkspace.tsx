import { Button, Input, Checkbox } from "@petlord/ui";
import { SelectField } from "@petlord/ui";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ArrowCounterClockwise,
  DownloadSimple,
  FloppyDisk,
  Plus,
  UploadSimple,
  Eye,
  Trash,
  GridFour,
} from "@phosphor-icons/react";
import {
  nativePixelDocumentSchema,
  type CharacterProject,
  type NativePixelDocument,
  type NativePixelLayer,
} from "@petlord/schema";
import { resolvePixelFrame, serializePixelDocument } from "@petlord/pixel-art";
import { NativePixelCanvas } from "./NativePixelCanvas";
import {
  createPixelDocument,
  importPixelDocument,
  paintPixel,
  replacePixelFrame,
  resizePixelLayer,
  updatePixelLayer,
} from "./pixelEditing";
import { NativeAnimationEditor } from "./NativeAnimationEditor";
import type { RunDesignCommand } from "./designCommand";
import type { StudioSelection } from "../studioTypes";
import { readPixelSourceDraft, savePixelSourceDraft } from "./drawingDrafts";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
export interface NativePixelWorkspaceProps {
  project: CharacterProject;
  runCommand: RunDesignCommand;
  onPreview: () => void;
  selection?: StudioSelection;
}
const json = (value: unknown) => JSON.stringify(value);
export function NativePixelWorkspace({
  project,
  runCommand,
  onPreview,
  selection,
}: NativePixelWorkspaceProps) {
  const cached = readPixelSourceDraft(project.id);
  const [draft, setDraft] = useState(cached?.document ?? project.pixelDocument);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [baseline, setBaseline] = useState(
    cached?.baseline ?? json(project.pixelDocument),
  );
  const observed = useRef(json(project.pixelDocument));
  const [conflict, setConflict] = useState(
    Boolean(cached && cached.baseline !== json(project.pixelDocument)),
  );
  const [frameId, setFrameId] = useState(
    project.pixelDocument?.frames[0]?.id ?? "",
  );
  const [layerId, setLayerId] = useState("");
  const [color, setColor] = useState(
    Object.keys(project.pixelDocument?.palette ?? {}).find(
      (key) => key !== ".",
    ) ?? "o",
  );
  const [zoom, setZoom] = useState(8);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<NativePixelDocument[]>([]);
  const [width, setWidth] = useState(48);
  const [height, setHeight] = useState(48);
  const [newColorKey, setNewColorKey] = useState("");
  const [newColor, setNewColor] = useState("#FFFFFF");
  const [stateId, setStateId] = useState(project.logicalStates[0]?.id ?? "");
  const [transitionId, setTransitionId] = useState(
    project.transitions[0]?.id ?? "",
  );
  const [targetId, setTargetId] = useState(project.logicalStates[0]?.id ?? "");
  const sourceKey = json(project.pixelDocument);
  const dirty = json(draft) !== baseline;
  useEffect(() => {
    savePixelSourceDraft(project.id, draft && (dirty || conflict) ? { document: draft, baseline } : undefined);
  }, [draft, dirty, conflict, baseline, project.id]);
  useEffect(() => {
    if (draft && color !== "." && !Object.hasOwn(draft.palette, color))
      setColor(Object.keys(draft.palette).find((key) => key !== ".") ?? ".");
  }, [draft, color]);
  useEffect(() => {
    if (sourceKey === observed.current) return;
    observed.current = sourceKey;
    if (!dirty || json(draft) === sourceKey) {
      setDraft(project.pixelDocument);
      setBaseline(sourceKey);
      setConflict(false);
    } else setConflict(true);
  }, [sourceKey]);
  useEffect(() => {
    if (!project.logicalStates.some((state) => state.id === targetId))
      setTargetId(project.logicalStates[0]?.id ?? "");
  }, [project.logicalStates, targetId]);
  useEffect(() => {
    if (!selection) return;
    const transition = selection.kind === "transition" ? project.transitions.find(item => item.id === selection.id) : undefined;
    const variant = transition ? project.variants.find(item => item.id === transition.fromVariantId) : undefined;
    const state = project.logicalStates.find(item => item.id === (selection.kind === "state" ? selection.id : variant?.logicalStateId));
    if (state) setStateId(state.id);
    if (transition) { setTransitionId(transition.id); setTargetId(transition.toLogicalStateId); }
    const artifactId = transition?.nativeAnimation?.frames[0]?.imageArtifactId ?? variant?.imageArtifactId ?? state?.referenceArtifactId;
    const selectedFrame = project.artifacts.find(item => item.id === artifactId)?.nativePixel?.frameId;
    if (selectedFrame && project.pixelDocument?.frames.some(frame => frame.id === selectedFrame)) setFrameId(selectedFrame);
  }, [selection?.kind, selection?.id]);
  const activeFrame =
    draft?.frames.find((frame) => frame.id === frameId) ?? draft?.frames[0];
  const resolved = useMemo(
    () =>
      draft && activeFrame
        ? resolvePixelFrame(draft, activeFrame.id)
        : undefined,
    [draft, activeFrame],
  );
  const layer =
    resolved?.layers.find((item) => item.id === layerId) ??
    resolved?.layers.at(-1);
  const selectedState =
    project.logicalStates.find((state) => state.id === stateId) ??
    project.logicalStates[0];
  const selectedTransition =
    project.transitions.find((transition) => transition.id === transitionId) ??
    project.transitions[0];
  function change(next: NativePixelDocument) {
    if (busy) return;
    try {
      const valid = nativePixelDocumentSchema.parse(next);
      if (draft && json(valid) !== json(draft))
        setHistory((old) => [...old.slice(-29), draft]);
      draftRef.current = valid;
      setDraft(valid);
      setError("");
      setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  function editLayer(patch: Partial<NativePixelLayer>) {
    if (!draft || !activeFrame || !layer) return;
    try {
      change(updatePixelLayer(draft, activeFrame.id, layer.id, patch));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  function resizeLayer(width: number, height: number) {
    if (!draft || !activeFrame || !layer) return;
    try {
      change(resizePixelLayer(draft, activeFrame.id, layer.id, width, height));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  async function task(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) throw new Error("请先创建或导入像素文档。");
    if (conflict)
      throw new Error("外部更新与本地草稿冲突，请先保留 JSON 再载入最新画布。");
    const result = await runCommand("pixel.document.save", { document: draft });
    setDraft(result.project.pixelDocument);
    setBaseline(json(result.project.pixelDocument));
    setConflict(false);
    return result;
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const document = importPixelDocument(await file.text());
      change(document);
      setFrameId(document.frames[0].id);
      setLayerId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([serializePixelDocument(draft)], { type: "application/json" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${project.name}-pixels.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function derive() {
    if (!draft || !activeFrame) return;
    let id = `${activeFrame.id}-copy`;
    for (let i = 2; draft.frames.some((frame) => frame.id === id); i++)
      id = `${activeFrame.id}-copy-${i}`;
    change(replacePixelFrame(draft, { id, baseFrameId: activeFrame.id }));
    setFrameId(id);
  }
  function deleteFrame() {
    if (!draft || !activeFrame) return;
    try {
      const next = nativePixelDocumentSchema.parse({
        ...draft,
        frames: draft.frames.filter((frame) => frame.id !== activeFrame.id),
      });
      change(next);
      setFrameId(next.frames[0].id);
    } catch {
      setError("无法删除：至少保留一帧，且其他帧不能再引用这帧。");
    }
  }
  function addLayer() {
    if (!draft || !activeFrame) return;
    let id = "layer";
    for (let i = 2; resolved?.layers.some((layer) => layer.id === id); i++)
      id = `layer-${i}`;
    change(
      replacePixelFrame(draft, {
        ...activeFrame,
        layers: [
          ...(activeFrame.layers ?? []),
          {
            id,
            x: 0,
            y: 0,
            rows: Array.from({ length: draft.height }, () =>
              ".".repeat(draft.width),
            ),
          },
        ],
      }),
    );
    setLayerId(id);
  }
  function flattenLayers(layers: NativePixelLayer[]) {
    if (draft && activeFrame)
      change(replacePixelFrame(draft, { id: activeFrame.id, layers }));
  }
  function shiftLayer(direction: number) {
    if (!layer || !resolved) return;
    const layers = [...resolved.layers];
    const index = layers.findIndex((item) => item.id === layer.id),
      next = index + direction;
    if (next < 0 || next >= layers.length) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    flattenLayers(layers);
  }
  const boundArtifact = project.artifacts.find(
    (artifact) => artifact.id === selectedState?.referenceArtifactId,
  );
  return (
    <main className="native-workspace">
      <header className="native-workspace-toolbar">
        <div>
          <span className="native-eyebrow">绘图</span>
          <h1>{project.characterName} 的绘图工作台</h1>
          <small>
            {draft
              ? `${draft.width} × ${draft.height} · ${draft.frames.length} 帧`
              : "从透明画布开始"}{" "}
            · {dirty ? "未保存草稿" : "已保存"}
          </small>
        </div>
        <div className="native-actions">
          {(dirty || conflict) && <Button type="default" htmlType="button" className="secondary-button" disabled={busy} title="恢复最后一次保存的画布" onClick={() => {
            setDraft(project.pixelDocument); draftRef.current = project.pixelDocument;
            setBaseline(sourceKey); setConflict(false); setHistory([]); setError("");
            setFrameId(current => project.pixelDocument?.frames.some(frame => frame.id === current) ? current : project.pixelDocument?.frames[0]?.id ?? "");
            setMessage("已放弃未保存的画布草稿。");
          }}>放弃画布草稿</Button>}
          <Button type="default"
            htmlType="button"
            className="secondary-button"
            onClick={download}
            disabled={!draft}
          >
            <DownloadSimple size={15} />
            导出 JSON
          </Button>
          <label className="secondary-button native-file-button">
            <UploadSimple size={15} />
            导入 JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void importFile(event);
              }}
              disabled={busy}
            />
          </label>
          <Button type="default"
            htmlType="button"
            className="secondary-button"
            onClick={onPreview}
            disabled={busy || dirty || conflict}
          >
            <Eye size={15} />
            运行时预览
          </Button>
          <Button type="primary"
            htmlType="button"
            className="primary-button"
            disabled={!draft || busy || conflict}
            onClick={() => {
              void task(save, "画布及已绑定的状态、动画已更新，可在本机应用。");
            }}
          >
            <FloppyDisk size={15} />
            {busy ? "处理中…" : "保存画布"}
          </Button>
        </div>
      </header>
      {conflict && (
        <div role="alert" className="native-notice is-error">
          外部更新已改变这份文档，本地草稿已保留。请先导出 JSON
          备份，再载入最新画布。
          <button
            type="button"
            onClick={() => {
              setDraft(project.pixelDocument);
              setBaseline(sourceKey);
              setConflict(false);
              setHistory([]);
            }}
          >
            载入最新画布
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="native-notice is-error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="native-notice">
          {message}
        </div>
      )}
      {!draft ? (
        <section className="native-onboarding">
          <GridFour size={42} weight="thin" />
          <h2>每一格，都由你决定。</h2>
          <p>创建透明画布，或载入彩票像素样例。已有状态与素材会保留。</p>
          <div className="native-inline-fields">
            <label>
              宽度
              <Input
                aria-label="新画布宽度"
                type="number"
                min={1}
                max={256}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <span>×</span>
            <label>
              高度
              <Input
                aria-label="新画布高度"
                type="number"
                min={1}
                max={256}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </label>
            <Button htmlType="button" type="primary"
              className="primary-button"
              onClick={() => {
                try {
                  const next = createPixelDocument(width, height);
                  change(next);
                  setFrameId(next.frames[0].id);
                } catch {
                  setError("画布宽高应为 1–256 的整数。");
                }
              }}
            >
              创建空白画布
            </Button>
          </div>
          <Button htmlType="button" type="default"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              void task(async () => {
                const response = await fetch(
                  "/demo/lottery-native/source.json",
                );
                if (!response.ok) throw new Error("彩票样例尚未安装。");
                const next = importPixelDocument(await response.text());
                change(next);
                setFrameId(next.frames[0].id);
              }, "已载入彩票原生像素样例，保存后即可绑定状态。");
            }}
          >
            载入彩票样例
          </Button>
        </section>
      ) : (
        <>
          <p className="native-workspace-help">为状态绘制像素帧；保存会刷新已绑定的图片与动画。</p>
            <div className="native-editor-grid">
              <aside className="native-frames">
                <header>
                  <strong>帧</strong>
                  <button
                    aria-label="派生帧"
                    title="从当前帧继承图层"
                    disabled={busy}
                    onClick={derive}
                  >
                    <Plus size={15} />
                    派生帧
                  </button>
                </header>
                <div className="native-frame-list">
                  {draft.frames.map((frame) => (
                    <button
                      key={frame.id}
                      className={
                        activeFrame?.id === frame.id ? "is-active" : ""
                      }
                      onClick={() => {
                        setFrameId(frame.id);
                        setLayerId("");
                      }}
                    >
                      <NativePixelCanvas
                        document={draft}
                        frameId={frame.id}
                        zoom={Math.min(
                          2,
                          72 / Math.max(draft.width, draft.height),
                        )}
                        label={`${frame.id} 缩略图`}
                      />
                      <span>
                        {frame.id}
                        <small>
                          {frame.baseFrameId
                            ? `继承 ${frame.baseFrameId}`
                            : "独立帧"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  className="native-delete"
                  disabled={busy || draft.frames.length < 2}
                  onClick={deleteFrame}
                >
                  <Trash size={14} />
                  删除当前帧
                </button>
              </aside>
              <section className="native-canvas-panel">
                <header>
                  <strong>{activeFrame?.id}</strong>
                  <div className="native-actions">
                    <button
                      type="button"
                      disabled={!history.length || busy}
                      aria-label="撤销像素编辑"
                      onClick={() => {
                        setDraft(history.at(-1));
                        setHistory((old) => old.slice(0, -1));
                      }}
                    >
                      <ArrowCounterClockwise size={15} />
                      撤销
                    </button>
                    <label>
                      缩放
                      <SelectField
                        aria-label="画布缩放"
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                      >
                        {[1, 2, 4, 6, 8, 12, 16].map((value) => (
                          <option key={value} value={value}>
                            {value}×
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    <Checkbox
                        checked={grid}
                        onChange={(e) => setGrid(e.target.checked)}
                      >
                      网格
                    </Checkbox>
                  </div>
                </header>
                <div className="native-canvas-scroll">
                  {activeFrame && (
                    <NativePixelCanvas
                      document={draft}
                      frameId={activeFrame.id}
                      zoom={zoom}
                      grid={grid}
                      editable={!busy && !conflict}
                      onPaint={(x, y) => {
                        if (!layer) return;
                        try {
                          change(
                            paintPixel(
                              draftRef.current ?? draft,
                              activeFrame.id,
                              layer.id,
                              x,
                              y,
                              color,
                            ),
                          );
                        } catch (caught) {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : String(caught),
                          );
                        }
                      }}
                    />
                  )}
                </div>
                <footer>
                  画笔：{color === "." ? "透明橡皮" : color} · 图层：
                  {layer?.id ?? "请添加图层"} · 方向键移动，空格绘制
                </footer>
              </section>
              <aside className="native-tools">
                <section>
                  <header>
                    <strong>调色板</strong>
                  </header>
                  <div className="native-palette">
                    <button
                      aria-label="透明橡皮"
                      className={`checkerboard ${color === "." ? "is-active" : ""}`}
                      onClick={() => setColor(".")}
                    >
                      ∅
                    </button>
                    {Object.entries(draft.palette)
                      .filter(([key]) => key !== ".")
                      .map(([key, value]) => (
                        <button
                          key={key}
                          title={`${key} ${value ?? "透明"}`}
                          aria-label={`颜色 ${key}`}
                          className={color === key ? "is-active" : ""}
                          onClick={() => setColor(key)}
                          style={{
                            backgroundColor: value ?? "transparent",
                            color: value ? "#fff" : undefined,
                            textShadow: "0 1px 3px #000",
                          }}
                        >
                          {key}
                        </button>
                      ))}
                  </div>
                  {color !== "." && (
                    <label className="native-color-edit">
                      颜色 {color}
                      <input
                        aria-label="编辑选中颜色"
                        type="color"
                        value={draft.palette[color] ?? "#000000"}
                        onChange={(e) =>
                          change({
                            ...draft,
                            palette: {
                              ...draft.palette,
                              [color]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="native-palette-add">
                    <Input
                      aria-label="新颜色键"
                      value={newColorKey}
                      maxLength={1}
                      placeholder="键"
                      onChange={(e) => setNewColorKey(e.target.value)}
                    />
                    <input
                      aria-label="新颜色值"
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                    />
                    <button
                      aria-label="添加颜色"
                      onClick={() => {
                        if (
                          !/^[!-~]$/.test(newColorKey) ||
                          newColorKey === "." ||
                          Object.hasOwn(draft.palette, newColorKey)
                        ) {
                          setError(
                            "请使用未占用的单个 ASCII 字符，. 保留为透明。",
                          );
                          return;
                        }
                        change({
                          ...draft,
                          palette: {
                            ...draft.palette,
                            [newColorKey]: newColor,
                          },
                        });
                        setColor(newColorKey);
                        setNewColorKey("");
                      }}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </section>
                <section>
                  <header>
                    <strong>图层 · 自下而上</strong>
                    <button
                      aria-label="添加图层"
                      disabled={busy}
                      onClick={addLayer}
                    >
                      <Plus size={15} />
                    </button>
                  </header>
                  <div className="native-layer-list">
                    {resolved?.layers.map((item) => (
                      <button
                        key={item.id}
                        className={layer?.id === item.id ? "is-active" : ""}
                        onClick={() => setLayerId(item.id)}
                      >
                        <span>{item.visible === false ? "○" : "●"}</span>
                        {item.id}
                        <small>
                          {item.rows[0].length}×{item.rows.length}
                        </small>
                      </button>
                    ))}
                  </div>
                  {layer && (
                    <>
                      <Checkbox className="native-visible"
                          checked={layer.visible !== false}
                          onChange={(e) =>
                            editLayer({ visible: e.target.checked })
                          }
                        >
                        显示当前图层
                      </Checkbox>
                      <div className="native-inline-fields">
                        <label>
                          X
                          <Input
                            aria-label="图层 X"
                            type="number"
                            min={0}
                            max={draft.width - layer.rows[0].length}
                            value={layer.x}
                            onChange={(e) =>
                              editLayer({ x: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Y
                          <Input
                            aria-label="图层 Y"
                            type="number"
                            min={0}
                            max={draft.height - layer.rows.length}
                            value={layer.y}
                            onChange={(e) =>
                              editLayer({ y: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <div className="native-actions">
                        <label>
                          宽
                          <Input
                            aria-label="图层宽度"
                            type="number"
                            min={1}
                            max={draft.width - layer.x}
                            value={layer.rows[0].length}
                            onChange={(event) =>
                              resizeLayer(
                                Number(event.target.value),
                                layer.rows.length,
                              )
                            }
                          />
                        </label>
                        <label>
                          高
                          <Input
                            aria-label="图层高度"
                            type="number"
                            min={1}
                            max={draft.height - layer.y}
                            value={layer.rows.length}
                            onChange={(event) =>
                              resizeLayer(
                                layer.rows[0].length,
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <button onClick={() => shiftLayer(-1)}>下移</button>
                        <button onClick={() => shiftLayer(1)}>上移</button>
                        <button
                          onClick={() =>
                            flattenLayers(
                              resolved!.layers.filter(
                                (item) => item.id !== layer.id,
                              ),
                            )
                          }
                        >
                          删除图层
                        </button>
                      </div>
                      <small>调整顺序或删除时，将继承图层展开为独立帧。</small>
                    </>
                  )}
                </section>
              </aside>
            </div>
          <section className="native-bindings">
            <div>
              <h2>绑定状态</h2>
              <p>
                将当前帧分配给一个逻辑状态。之后保存画布会同步更新已有绑定。
              </p>
            </div>
            <div className="native-binding-controls">
              <label>
                逻辑状态
                <SelectField
                  aria-label="绑定逻辑状态"
                  value={selectedState?.id ?? ""}
                  onChange={(e) => setStateId(e.target.value)}
                >
                  <option value="" disabled>
                    先创建状态
                  </option>
                  {project.logicalStates.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.label}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label>
                当前帧
                <Input value={activeFrame?.id ?? ""} readOnly />
              </label>
              <Button htmlType="button" type="default"
                className="secondary-button"
                disabled={busy || conflict || !selectedState || !activeFrame}
                onClick={() => {
                  void task(async () => {
                    await save();
                    await runCommand("pixel.state.bind", {
                      stateId: selectedState!.id,
                      frameId: activeFrame!.id,
                    });
                  }, "状态帧已绑定并批准。");
                }}
              >
                绑定当前帧
              </Button>
              <Button htmlType="button" type="default"
                className="secondary-button"
                disabled={busy || conflict || !selectedState || !activeFrame}
                onClick={() => {
                  void task(async () => {
                    await save();
                    await runCommand("pixel.state.bind", {
                      stateId: selectedState!.id,
                      frameId: activeFrame!.id,
                      setInitial: true,
                    });
                  }, "已设为初始状态。");
                }}
              >
                绑定并设为初始
              </Button>
              <small>
                已绑定：
                {boundArtifact?.nativePixel?.frameId ?? "尚未绑定原生帧"}
              </small>
            </div>
            <CreateEntityDialog label="新增状态" title="新增状态" description="为这个项目添加一个状态，再绑定画布中的帧。" fieldLabel="状态名称" placeholder="例如：坐着" disabled={busy} onCreate={async name => {
              setBusy(true); setError("");
              try { const result = await runCommand("state.create", { label: name }); setStateId(result.project.logicalStates.at(-1)?.id ?? ""); setMessage("逻辑状态已创建。"); }
              finally { setBusy(false); }
            }} />
          </section>
          <section className="native-animation-section">
            <header>
              <div>
                <h2>动画时间线</h2>
                <p>每个条目保留自己的时长；首尾帧与源、目标状态严格一致。</p>
              </div>
              <label>
                转换
                <SelectField
                  aria-label="选择原生动画"
                  value={selectedTransition?.id ?? ""}
                  onChange={(e) => setTransitionId(e.target.value)}
                >
                  <option value="" disabled>
                    先创建转换
                  </option>
                  {project.transitions.map((transition) => (
                    <option key={transition.id} value={transition.id}>
                      {transition.label}
                    </option>
                  ))}
                </SelectField>
              </label>
            </header>
            <div className="native-inline-fields">
              <span>从 {selectedState?.label ?? "已绑定源状态"} 到</span>
              <SelectField
                aria-label="新转换目标状态"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {project.logicalStates.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.label}
                  </option>
                ))}
              </SelectField>
              <Button htmlType="button" type="default"
                className="secondary-button"
                disabled={busy || !selectedState || !targetId}
                onClick={() => {
                  void task(async () => {
                    const source =
                      project.variants.find(
                        (variant) =>
                          variant.id === selectedState?.defaultVariantId,
                      ) ??
                      project.variants.find(
                        (variant) =>
                          variant.logicalStateId === selectedState?.id &&
                          variant.status === "approved",
                      );
                    if (!source) throw new Error("请先将源状态绑定到一帧。");
                    const result = await runCommand("transition.create", {
                      label: `${selectedState!.label} → ${project.logicalStates.find((state) => state.id === targetId)?.label}`,
                      fromVariantId: source.id,
                      toLogicalStateId: targetId,
                      endFrameSource: "authority-reference",
                    });
                    setTransitionId(
                      result.project.transitions.at(-1)?.id ?? "",
                    );
                  }, "转换已创建，可编排时间线。");
                }}
              >
                <Plus size={15} />
                创建转换
              </Button>
            </div>
            {selectedTransition && (
              <NativeAnimationEditor
                key={selectedTransition.id}
                project={project}
                document={draft}
                transition={selectedTransition}
                busy={busy || conflict}
                runCommand={runCommand}
                saveDocument={save}
                onTask={task}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}
