import { Check, ImagesSquare } from "@phosphor-icons/react";
import type { Artifact } from "@petlord/schema";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

interface StateCandidatePickerProps {
  candidates: Artifact[];
  activeArtifactId?: string;
  onSelect: (artifactId: string) => void;
}

export function StateCandidatePicker({ candidates, activeArtifactId, onSelect }: StateCandidatePickerProps) {
  if (candidates.length === 0) return null;
  return (
    <section className="candidate-picker">
      <header><div><ImagesSquare size={17} weight="fill" /><strong>本轮生成候选</strong></div><span>选择一张作为权威参考</span></header>
      <PreviewableImageGroup><div className="candidate-list">
        {candidates.map((candidate, index) => (
          <article className={candidate.id === activeArtifactId ? "is-selected" : ""} key={candidate.id}>
            <div className="candidate-image checkerboard"><PreviewableImage src={candidate.uri} alt={`${candidate.label ?? `候选 ${index + 1}`}预览`} />{candidate.id === activeArtifactId && <i><Check size={14} weight="bold" />已采用</i>}</div>
            <footer><span>候选 {index + 1}</span><button type="button" onClick={() => onSelect(candidate.id)}>{candidate.id === activeArtifactId ? "当前权威图" : "采用这张"}</button></footer>
          </article>
        ))}
      </div></PreviewableImageGroup>
    </section>
  );
}
