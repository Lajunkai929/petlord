import { Check, FilmStrip } from "@phosphor-icons/react";
import type { CharacterProject, Transition } from "@petlord/schema";
import { ensureTransitionMediaVersions, resolveActiveMediaVersion } from "../transitionMedia";
import { GenerationPromptDialog } from "./GenerationPromptDialog";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

export function TransitionMediaHistory({
  project,
  transition,
  onActivate,
}: {
  project: CharacterProject;
  transition: Transition;
  onActivate: (versionId: string) => void;
}) {
  const versions = ensureTransitionMediaVersions(transition, project.artifacts)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const active = resolveActiveMediaVersion(transition, project.artifacts);
  if (versions.length === 0) return null;
  return (
    <section className="transition-media-history">
      <div className="transition-media-history__heading"><div><FilmStrip size={17} weight="fill" /><strong>视频版本历史</strong></div><span>{versions.length} 个版本 · 永久保留</span></div>
      <PreviewableImageGroup><div className="transition-media-history__list">{versions.map((version) => {
        const tail = project.artifacts.find((artifact) => artifact.id === version.tailArtifactId);
        const isActive = active?.id === version.id;
        return (
          <article className={isActive ? "is-active" : ""} key={version.id}>
            <span className="transition-media-history__thumb checkerboard">{tail && <PreviewableImage src={tail.uri} alt={`${version.label}结束帧`} />}</span>
            <button className="transition-media-history__select" type="button" onClick={() => onActivate(version.id)}>
              <span className="transition-media-history__meta"><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small><span className="transition-media-history__badges"><em className={version.transparent ? "is-transparent" : ""}>{version.transparent ? "透明背景" : "普通原视频"}</em>{version.playback?.mode === "ping-pong" && <><em className="is-ping-pong">正反往复</em>{version.playback.segmentEndMs !== undefined && <em>{(version.playback.segmentStartMs / 1000).toFixed(1)}–{(version.playback.segmentEndMs / 1000).toFixed(1)}s</em>}</>}</span></span>
              {isActive ? <span className="transition-media-history__active"><Check size={13} weight="bold" />当前使用</span> : <span className="transition-media-history__use">切换</span>}
            </button>
            {version.generationPrompt
              ? <GenerationPromptDialog compact title={`${version.label} · 历史生成提示词`} prompt={version.generationPrompt} model={version.generationModel} chromaKeyColor={version.chromaKeyColor} />
              : <span className="prompt-history-missing">旧版本<br />未记录</span>}
          </article>
        );
      })}</div></PreviewableImageGroup>
    </section>
  );
}
