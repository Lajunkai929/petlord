import { Button, Input } from "@petlord/ui";
import { SelectField } from "@petlord/ui";
import { useEffect, useState } from "react";
import {
  Play,
  Stop,
  Plus,
  Trash,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  defaultTransitionPlayback,
  type CharacterProject,
  type NativePixelDocument,
  type Transition,
  type TransitionPlayback,
} from "@petlord/schema";
import { createNativeSpritePlayback } from "@petlord/runtime-react";
import { NativePixelCanvas } from "./NativePixelCanvas";
import { TransitionTriggerEditor } from "../components/TransitionTriggerEditor";
import type { RunDesignCommand, StudioDesignResult } from "./designCommand";
import { readPixelTimelineDraft, savePixelTimelineDraft } from "./drawingDrafts";
interface TimedFrame {
  frameId: string;
  durationMs: number;
}
export function NativeAnimationEditor({
  project,
  document,
  transition,
  busy,
  runCommand,
  saveDocument,
  onTask,
}: {
  project: CharacterProject;
  document: NativePixelDocument;
  transition: Transition;
  busy: boolean;
  runCommand: RunDesignCommand;
  saveDocument: () => Promise<StudioDesignResult>;
  onTask: (action: () => Promise<unknown>, success: string) => Promise<unknown>;
}) {
  const fromVariant = project.variants.find(
    (variant) => variant.id === transition.fromVariantId,
  );
  const sourceArtifact = project.artifacts.find(
    (artifact) => artifact.id === fromVariant?.imageArtifactId,
  );
  const targetState = project.logicalStates.find(
    (state) => state.id === transition.toLogicalStateId,
  );
  const targetArtifact = project.artifacts.find(
    (artifact) =>
      artifact.id ===
      (targetState?.id === fromVariant?.logicalStateId
        ? sourceArtifact?.id
        : targetState?.referenceArtifactId),
  );
  const defaultFrames: TimedFrame[] = transition.nativeAnimation?.frames.map(
    (frame) => ({
      frameId:
        project.artifacts.find(
          (artifact) => artifact.id === frame.imageArtifactId,
        )?.nativePixel?.frameId ?? "",
      durationMs: frame.durationMs,
    }),
  ) ?? [
    {
      frameId: sourceArtifact?.nativePixel?.frameId ?? document.frames[0].id,
      durationMs: 150,
    },
    {
      frameId:
        targetArtifact?.nativePixel?.frameId ?? document.frames.at(-1)!.id,
      durationMs: 150,
    },
  ];
  const incomingRepeat = transition.playback ?? defaultTransitionPlayback;
  const incoming = JSON.stringify({frames: defaultFrames, repeat: incomingRepeat});
  const cached = readPixelTimelineDraft(project.id, transition.id);
  const [frames, setFrames] = useState(cached?.frames ?? defaultFrames);
  const [repeat, setRepeat] = useState(cached?.repeat ?? incomingRepeat);
  const [baseline, setBaseline] = useState(cached?.baseline ?? incoming);
  const [conflict, setConflict] = useState(
    Boolean(cached && cached.baseline !== incoming),
  );
  const dirty = JSON.stringify({ frames, repeat }) !== baseline;
  useEffect(() => {
    savePixelTimelineDraft(project.id, transition.id, dirty || conflict ? { frames, repeat, baseline } : undefined);
  }, [frames, repeat, baseline, conflict, project.id, transition.id]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  useEffect(() => {
    if (incoming === baseline) return;
    if (
      JSON.stringify({frames, repeat}) === baseline ||
      JSON.stringify({frames, repeat}) === incoming
    ) {
      setFrames(defaultFrames);
      setRepeat(incomingRepeat);
      setBaseline(incoming);
      setConflict(false);
    } else setConflict(true);
  }, [incoming]);
  const invalid =
    frames.length === 0 ||
    frames.length > 256 ||
    frames.some(
      (frame) =>
        !document.frames.some((source) => source.id === frame.frameId) ||
        !Number.isInteger(frame.durationMs) ||
        frame.durationMs < 1 ||
        frame.durationMs > 60000,
    );
  const endpointMismatch = Boolean(
    (sourceArtifact?.nativePixel &&
      frames[0]?.frameId !== sourceArtifact.nativePixel.frameId) ||
      (targetArtifact?.nativePixel &&
        frames.at(-1)?.frameId !== targetArtifact.nativePixel.frameId),
  );
  const endpointsReady = [sourceArtifact, targetArtifact].every(artifact => artifact?.nativePixel && artifact.nativePixel.width === document.width && artifact.nativePixel.height === document.height && document.frames.some(frame => frame.id === artifact.nativePixel?.frameId));
  const duration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  useEffect(() => {
    if (!playing || invalid) return;
    let raf = 0;
    const player = createNativeSpritePlayback(
      frames.map((frame) => ({
        imageUri: frame.frameId,
        durationMs: frame.durationMs,
      })),
      1,
      {
        onFrame: () => {},
        onTime: (elapsed) => {
          let edge = 0;
          const index = frames.findIndex((frame) => {
            edge += frame.durationMs;
            return elapsed < edge;
          });
          setPlayhead(Math.max(0, index));
        },
        onComplete: () => {
          setPlayhead(frames.length - 1);
          setPlaying(false);
        },
      },
    );
    const tick = (at: number) => {
      player.tick(at);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      player.dispose();
      cancelAnimationFrame(raf);
    };
  }, [playing, frames, invalid]);
  function change(index: number, patch: Partial<TimedFrame>) {
    setPlaying(false);
    setFrames((old) =>
      old.map((frame, at) => (at === index ? { ...frame, ...patch } : frame)),
    );
  }
  function move(index: number, offset: number) {
    setPlaying(false);
    setFrames((old) => {
      const next = [...old];
      const target = index + offset;
      if (target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function bind(approve: boolean) {
    if (!endpointsReady) throw new Error("请先为起点和终点绑定尺寸一致的像素帧。");
    const saved = await saveDocument();
    const savedTransition = saved.project.transitions.find(item => item.id === transition.id);
    const replacements = (saved.value as {artifactReplacements?: Record<string, string>} | undefined)?.artifactReplacements ?? {};
    const expectedAnimation = transition.nativeAnimation ? {
      ...transition.nativeAnimation,
      frames: transition.nativeAnimation.frames.map(frame => ({
        ...frame,
        imageArtifactId: Object.hasOwn(replacements, frame.imageArtifactId) ? replacements[frame.imageArtifactId] : frame.imageArtifactId,
      })),
    } : undefined;
    if (
      JSON.stringify(savedTransition?.nativeAnimation) !== JSON.stringify(expectedAnimation) || JSON.stringify(savedTransition?.playback) !== JSON.stringify(transition.playback)
    )
      throw new Error("动画收到外部更新，请载入最新时间线后重试。");
    const result = await runCommand("pixel.animation.bind", {
      transitionId: transition.id,
      frames,
      playback: {repeatMode: repeat.repeatMode, minCycles: repeat.minCycles, maxCycles: repeat.maxCycles},
      approve,
    });
    const savedRepeat = result.project.transitions.find(item => item.id === transition.id)?.playback ?? repeat;
    setRepeat(savedRepeat);
    setBaseline(JSON.stringify({frames, repeat: savedRepeat}));
    setConflict(false);
    return result;
  }
  const preview = frames[playhead] ?? frames[0];
  return (
    <div className="native-animation-editor">
      {conflict && (
        <div className="native-notice is-error" role="alert">
          此动画收到外部更新，时间线草稿已保留。
          <button
            onClick={() => {
              setFrames(defaultFrames);
              setRepeat(incomingRepeat);
              setBaseline(incoming);
              setConflict(false);
            }}
          >
            载入最新时间线
          </button>
        </div>
      )}
      <div className="native-timeline-review">
        <div className="native-animation-preview">
          {preview &&
            document.frames.some((frame) => frame.id === preview.frameId) && (
              <NativePixelCanvas
                document={document}
                frameId={preview.frameId}
                zoom={Math.min(
                  6,
                  240 / Math.max(document.width, document.height),
                )}
                label="动画审核画布"
              />
            )}
          <div className="native-actions">
            <Button htmlType="button" type="default"
              className="secondary-button"
              disabled={invalid}
              onClick={() => {
                setPlayhead(0);
                setPlaying((current) => !current);
              }}
            >
              {playing ? <Stop size={15} /> : <Play size={15} />}{" "}
              {playing ? "停止" : "播放审核"}
            </Button>
            <span>
              {duration} ms · {frames.length} 帧
            </span>
          </div>
        </div>
        <div className="native-timeline">
          <header>
            <strong>显式帧时序</strong>
            <button
              disabled={busy || frames.length >= 256}
              onClick={() =>
                setFrames((old) => [
                  ...old,
                  { frameId: document.frames[0].id, durationMs: 150 },
                ])
              }
            >
              <Plus size={15} />
              添加帧
            </button>
          </header>
          <ol>
            {frames.map((frame, index) => (
              <li key={index} className={playhead === index ? "is-active" : ""}>
                <button
                  className="native-frame-number"
                  aria-label={`预览第 ${index + 1} 帧`}
                  onClick={() => {
                    setPlaying(false);
                    setPlayhead(index);
                  }}
                >
                  {index + 1}
                </button>
                <SelectField
                  aria-label={`第 ${index + 1} 帧`}
                  value={frame.frameId}
                  disabled={busy}
                  onChange={(e) => change(index, { frameId: e.target.value })}
                >
                  {!document.frames.some(
                    (source) => source.id === frame.frameId,
                  ) && <option value={frame.frameId}>源帧已删除</option>}
                  {document.frames.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.id}
                    </option>
                  ))}
                </SelectField>
                <label>
                  <Input
                    aria-label={`第 ${index + 1} 帧时长`}
                    type="number"
                    min={1}
                    max={60000}
                    value={frame.durationMs}
                    disabled={busy}
                    onChange={(e) =>
                      change(index, { durationMs: Number(e.target.value) })
                    }
                  />
                  ms
                </label>
                <button
                  disabled={busy || index === 0}
                  aria-label={`前移第 ${index + 1} 帧`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeft size={13} />
                </button>
                <button
                  disabled={busy || index === frames.length - 1}
                  aria-label={`后移第 ${index + 1} 帧`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight size={13} />
                </button>
                <button
                  disabled={busy || frames.length < 2}
                  aria-label={`移除第 ${index + 1} 帧`}
                  onClick={() => {
                    setPlaying(false);
                    setFrames((old) => old.filter((_, at) => at !== index));
                  }}
                >
                  <Trash size={13} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="native-timeline-meta">
        <p>
          起始帧：
          <b>{sourceArtifact?.nativePixel?.frameId ?? "源状态尚未绑定"}</b> →
          结束帧：
          <b>{targetArtifact?.nativePixel?.frameId ?? "目标状态尚未绑定"}</b>
        </p>
        <div className="native-inline-fields">
          <label>
            重复
            <SelectField
              aria-label="原生动画重复模式"
              disabled={busy}
              value={repeat.repeatMode}
              onChange={(e) =>
                setRepeat({
                  ...repeat,
                  repeatMode: e.target.value as "fixed" | "random",
                })
              }
            >
              <option value="fixed">固定轮数</option>
              <option value="random">随机轮数</option>
            </SelectField>
          </label>
          <label>
            {repeat.repeatMode === "fixed" ? "轮数" : "最少轮数"}
            <Input
              aria-label="原生动画最少轮数"
              disabled={busy}
              type="number"
              min={1}
              max={12}
              value={repeat.minCycles}
              onChange={(e) => {
                const value = Math.max(1, Math.min(12, Number(e.target.value)));
                setRepeat({
                  ...repeat,
                  minCycles: value,
                  maxCycles:
                    repeat.repeatMode === "fixed"
                      ? value
                      : Math.max(value, repeat.maxCycles),
                });
              }}
            />
          </label>
          {repeat.repeatMode === "random" && (
            <label>
              最多轮数
              <Input
                aria-label="原生动画最多轮数"
                disabled={busy}
                type="number"
                min={repeat.minCycles}
                max={12}
                value={repeat.maxCycles}
                onChange={(e) =>
                  setRepeat({
                    ...repeat,
                    maxCycles: Math.max(
                      repeat.minCycles,
                      Math.min(12, Number(e.target.value)),
                    ),
                  })
                }
              />
            </label>
          )}
        </div>
        {invalid && <p role="alert">帧必须存在，时长为 1–60000 ms 的整数。</p>}
        {endpointMismatch && (
          <p role="alert">
            首尾帧与已绑定状态不一致，请调整时间线或重新绑定状态。
          </p>
        )}
        {!endpointsReady && <p role="status">编排帧动画需要为起点和终点绑定尺寸一致的像素帧；现有视频仍保留在状态与动作中。</p>}
        <div className="native-actions">
          <span>
            {transition.status === "approved"
              ? "当前快照已批准"
              : "当前快照未批准"}
          </span>
          {(dirty || conflict) && <Button type="default" htmlType="button" className="secondary-button" disabled={busy} onClick={() => { setFrames(defaultFrames); setRepeat(incomingRepeat); setBaseline(incoming); setConflict(false); setPlaying(false); }}>放弃动画草稿</Button>}
          <Button htmlType="button" type="default"
            className="secondary-button"
            disabled={busy || invalid || conflict || endpointMismatch || !endpointsReady}
            onClick={() => {
              void onTask(() => bind(false), "动画草稿已保存。");
            }}
          >
            保存动画
          </Button>
          <Button htmlType="button" type="primary"
            className="primary-button"
            disabled={busy || invalid || conflict || endpointMismatch || !endpointsReady}
            onClick={() => {
              void onTask(
                () => bind(true),
                "动画已绑定并批准，可在运行时预览。",
              );
            }}
          >
            批准动画
          </Button>
        </div>
      </div>
      <fieldset className="native-trigger-fieldset" disabled={busy}>
        <TransitionTriggerEditor
          sourceImage={sourceArtifact?.uri}
          triggers={transition.triggers}
          onChange={(triggers) => {
            void onTask(
              () =>
                runCommand("transition.update", {
                  transitionId: transition.id,
                  patch: { triggers },
                }),
              "触发条件已更新。",
            );
          }}
        />
      </fieldset>
    </div>
  );
}
