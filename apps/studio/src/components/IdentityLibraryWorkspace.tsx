import { Check, FolderPlus, Images, Plus, UploadSimple } from "@phosphor-icons/react";
import type { StudioController } from "../hooks/useStudioController";
import { useIdentityLibrary } from "../hooks/useIdentityLibrary";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

export function IdentityLibraryWorkspace({ studio }: { studio: StudioController }) {
  const controller = useIdentityLibrary(studio);
  const identity = studio.activeIdentity;
  return (
    <main className="page-workspace identity-library-workspace">
      <header className="page-heading identity-library-heading">
        <div><span>形象</span><h1>管理身份参考。</h1><p>上传实拍素材并维护稳定特征。</p></div>
        <form className="identity-create-form" onSubmit={controller.submitNewIdentity}>
          <input value={controller.newIdentityName} onChange={(event) => controller.setNewIdentityName(event.target.value)} placeholder="新形象名称，例如 Lottery" aria-label="新形象名称" />
          <button className="primary-button" type="submit" disabled={!controller.newIdentityName.trim()}><Plus size={15} weight="bold" />新增形象</button>
        </form>
      </header>
      <div className="identity-library-layout">
        <aside className="identity-profile-list">
          <div className="section-title"><h2>所有形象</h2><span>{studio.identities.length}</span></div>
          <div className="identity-profile-list__items">
            {studio.identities.map((candidate) => {
              const cover = candidate.referenceArtifacts[0];
              const active = candidate.id === identity?.id;
              return (
                <button type="button" className={active ? "is-active" : ""} onClick={() => studio.activateIdentityProfile(candidate.id)} key={candidate.id}>
                  <span className="identity-avatar checkerboard">{cover ? <img src={cover.uri} alt={candidate.name} /> : <Images size={22} weight="thin" />}</span>
                  <span><strong>{candidate.name}</strong><small>{candidate.referenceArtifacts.length} 份实拍 · {controller.projectCounts.get(candidate.id) ?? 0} 个项目</small></span>
                  {active && <Check size={15} weight="bold" />}
                </button>
              );
            })}
          </div>
        </aside>
        {identity ? (
          <section className="identity-profile-editor">
            <header><div><span>身份档案</span><h2>{identity.name}</h2></div><button className="secondary-button" type="button" onClick={() => studio.setActiveArea("orders")}><FolderPlus size={15} />用它创建项目</button></header>
            <div className="identity-editor-grid">
              <div className="identity-reference-editor">
                <div className="section-title"><h3>实拍参考素材</h3><span>{identity.referenceArtifacts.length} 份</span></div>
                <PreviewableImageGroup><div className="reference-grid">
                  {identity.referenceArtifacts.map((artifact) => <figure className="reference-tile checkerboard" key={artifact.id}><PreviewableImage src={artifact.uri} alt={artifact.label ?? "实拍身份参考"} /><figcaption>{artifact.label}</figcaption></figure>)}
                  <button className="upload-tile" type="button" onClick={() => studio.referenceInput.current?.click()}><UploadSimple size={25} weight="thin" /><strong>添加图片</strong></button>
                  <input ref={studio.referenceInput} type="file" accept="image/*" multiple hidden onChange={(event) => { studio.uploadReferences(event.target.files); event.target.value = ""; }} />
                </div></PreviewableImageGroup>
              </div>
              <aside className="identity-definition-panel">
                <label><span>形象名称</span><input value={identity.name} onChange={(event) => studio.updateIdentityProfile({ name: event.target.value })} /></label>
                <label><span>补充识别特征（可选）</span><textarea rows={8} value={identity.identityPrompt} onChange={(event) => studio.updateIdentityProfile({ identityPrompt: event.target.value })} /></label>
              </aside>
            </div>
          </section>
        ) : (
          <section className="identity-empty"><Images size={34} weight="thin" /><h2>先创建第一个宠物形象</h2><p>创建后上传实拍图片，再基于它建立不同风格的项目。</p></section>
        )}
      </div>
    </main>
  );
}
