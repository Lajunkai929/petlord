import { ArrowRight, ImageSquare } from "@phosphor-icons/react";
import type { CharacterProject, IdentityProfile } from "@petlord/schema";
import type { ProjectSummary } from "../hooks/useProjectWorkspace";
import { useProjectLibraryModel } from "../hooks/useProjectLibraryModel";
import { type NewOrderInput, type ProjectTemplateDefinition } from "../projectTemplate";
import { NewOrderDialog } from "./NewOrderDialog";
import type { StyleProfile } from "../styleLibrary";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

export function OrderWorkspace({
  projects,
  identities,
  styles,
  templates,
  activeIdentityId,
  activeStyleProfileId,
  currentProject,
  storageError,
  onOpenProject,
  onCreate,
}: {
  projects: ProjectSummary[];
  identities: IdentityProfile[];
  styles: StyleProfile[];
  templates: ProjectTemplateDefinition[];
  activeIdentityId?: string;
  activeStyleProfileId?: string;
  currentProject: CharacterProject;
  storageError?: string;
  onOpenProject: (id: string) => void;
  onCreate: (input: NewOrderInput, duplicateCurrent: boolean) => void;
}) {
  const library = useProjectLibraryModel(projects, styles, currentProject.id);
  return (
    <main className="page-workspace project-library-workspace">
      <header className="project-library-header">
        <div><h1>项目</h1><p>为同一形象创建不同风格、状态和交互版本。</p></div>
        <div className="project-library-actions"><span>{library.cards.length} 个项目 · {identities.length} 个形象</span><NewOrderDialog identities={identities} styles={styles} templates={templates} activeIdentityId={activeIdentityId} activeStyleProfileId={activeStyleProfileId} onCreate={onCreate} /></div>
      </header>
      {storageError && <p className="project-storage-error">项目未保存：{storageError}</p>}
      <PreviewableImageGroup><section className="project-library-grid" aria-label="项目列表">
        {library.cards.map((project) => (
          <article className={`project-library-card ${project.current ? "is-current" : ""}`} key={project.id}>
            <span className="project-library-thumb checkerboard">{project.thumbnail ? <PreviewableImage src={project.thumbnail} alt={`${project.characterName}项目预览`} /> : <ImageSquare size={24} weight="thin" />}</span>
            <button className="project-library-open" type="button" onClick={() => onOpenProject(project.id)} aria-label={`打开项目：${project.name}`}>
              <span className="project-library-main">
                <span className="project-library-name"><strong>{project.name}</strong>{project.current && <em>当前</em>}</span>
                <small>{project.characterName} · {project.styleName}</small>
                <span className="project-library-progress"><i style={{ transform: `scaleX(${project.progress / 100})` }} /></span>
                <span className="project-library-meta"><span>{project.stateCount} 个状态</span><span>{project.approvedTransitionCount}/{project.transitionCount} 条动画</span><time>{project.updatedLabel}</time></span>
              </span>
              <ArrowRight className="project-library-arrow" size={16} />
            </button>
          </article>
        ))}
      </section></PreviewableImageGroup>
    </main>
  );
}
