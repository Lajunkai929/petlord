import { useId, useState, type FormEvent } from "react";
import { Alert, Button, Radio, DialogContent, SelectField, Dialog } from "@petlord/ui";
import { Images, X } from "@phosphor-icons/react";
import type { Artifact, CharacterProject, IdentityProfile } from "@petlord/schema";
import type { StudioSelection } from "../studioTypes";
import { selectedStateReference } from "../projectReferences";
import "./EntityDialogs.css";
import "./ProjectReferenceDialog.css";

export type ProjectReferenceRequest =
  | { kind: "identity"; identityId: string }
  | { kind: "state"; stateId: string }
  | { kind: "upload"; files: File[] };

function ReferenceImages({ references }: { references: Artifact[] }) {
  return <div className="project-reference-images">{references.map(reference => <img key={reference.id} src={reference.uri} alt={reference.label ?? "角色参考图"} style={{ imageRendering: reference.nativePixel ? "pixelated" : undefined }} />)}</div>;
}

export function ProjectReferenceDialog({ project, identities, selection, onSave }: {
  project: CharacterProject;
  identities: IdentityProfile[];
  selection: StudioSelection;
  onSave: (request: ProjectReferenceRequest) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"identity" | "upload" | "state">("upload");
  const [identityId, setIdentityId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const identity = identities.find(candidate => candidate.id === identityId);
  const currentState = selectedStateReference(project, selection);
  const currentReferences = project.referenceArtifactIds.flatMap(referenceId => project.artifacts.find(artifact => artifact.id === referenceId) ?? []);
  function changeOpen(next: boolean) {
    if (saving) return;
    setOpen(next); setError(""); setFiles([]); setSource("upload"); setIdentityId(project.identityProfileId ?? "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (source === "identity" && !identity) { setError("请选择一个复用角色。"); return; }
    if (source === "upload" && !files.length) { setError("请选择至少一张图片。"); return; }
    if (source === "upload" && files.some(file => !file.type.startsWith("image/"))) { setError("请选择图片文件。"); return; }
    if (source === "state" && (!currentState || selection?.kind !== "state")) { setError("请先选择一个有已确认图片的状态。"); return; }
    setSaving(true); setError("");
    try {
      await onSave(source === "identity" ? { kind: "identity", identityId } : source === "upload" ? { kind: "upload", files } : { kind: "state", stateId: selection!.id });
      setOpen(false); setFiles([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "参考图保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><Button type="default" icon={<Images size={16} />}>配置参考图</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><DialogContent className="dialog-content entity-create-dialog project-reference-dialog" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}>
      <header className="entity-dialog-heading"><div><Dialog.Title>项目角色参考图</Dialog.Title><Dialog.Description>为“{project.name}”设置图片生成依据，保留已有状态与动作。</Dialog.Description></div><Dialog.Close asChild><Button type="default" aria-label="关闭" disabled={saving} icon={<X size={18} />} /></Dialog.Close></header>
      <form onSubmit={event => { void submit(event); }} noValidate>
        <div className="project-reference-current"><strong>当前参考 · {currentReferences.length} 张</strong>{currentReferences.length ? <ReferenceImages references={currentReferences} /> : <p>添加参考图后，即可在这个项目中生成图片。</p>}</div>
        <Radio.Group aria-label="参考图来源" value={source} disabled={saving} onChange={event => { setSource(event.target.value); setError(""); }} options={[{ label: "上传图片", value: "upload" }, { label: "复用角色", value: "identity" }, { label: "当前状态", value: "state" }]} />
        {source === "identity" ? <>
          <label htmlFor={`${id}-identity`}>复用角色</label>
          <SelectField id={`${id}-identity`} aria-label="复用角色" value={identityId} disabled={saving} onChange={event => { setIdentityId(event.target.value); setError(""); }}>
            <option value="">请选择角色</option>{identities.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </SelectField>
          <p className="project-reference-help">使用所选角色的名字、身份描述与全部参考图，替换当前生成参考来源；以后随该角色更新。</p>
          {identity && <ReferenceImages references={identity.referenceArtifacts} />}
          {identity && !identity.referenceArtifacts.length && <Alert type="info" showIcon title="此角色还没有参考图，关联后仍需添加图片才能生成。" />}
        </> : <>
          {source === "upload" ? <><label htmlFor={`${id}-files`}>图片文件</label><input id={`${id}-files`} type="file" accept="image/*" multiple disabled={saving} onChange={event => { setFiles(Array.from(event.target.files ?? [])); setError(""); }} />{files.length > 0 && <p className="project-reference-help">已选择 {files.length} 张：{files.map(file => file.name).join("、")}</p>}</> : currentState ? <div className="project-reference-state"><img src={currentState.uri} alt="当前状态参考图" style={{ imageRendering: currentState.nativePixel ? "pixelated" : undefined }} /><span>{project.logicalStates.find(state => state.id === selection?.id)?.label} · 已确认图片</span></div> : <Alert type="info" title="请先在图中选择一个有已确认图片的状态。" showIcon />}
          <p className="project-reference-help">追加到当前参考图，作为本项目的独立素材。{project.identityProfileId ? "保存后解除全局角色关联，保留当前名字、身份描述和参考图。" : "仅用于当前项目。"}</p>
        </>}
        {error && <Alert type="error" title={error} role="alert" showIcon />}
        <footer className="entity-dialog-footer"><Dialog.Close asChild><Button type="default" disabled={saving}>取消</Button></Dialog.Close><Button type="primary" htmlType="submit" loading={saving}>保存参考图</Button></footer>
      </form>
    </DialogContent></Dialog.Portal>
  </Dialog.Root>;
}
