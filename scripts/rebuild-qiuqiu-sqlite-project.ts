import { parseReferenceArguments, readReferenceFile, runReferenceCli } from "./local-reference-inputs.mjs";
import type { Artifact, IdentityProfile } from "@petlord/schema";
import type { PersistentGenerationJob } from "@petlord/generation";
import { defaultStyleProfiles } from "../apps/studio/src/styleLibrary";
import { activateAuthorityReference, createBlankProject, promoteReferenceToInitialState } from "../apps/studio/src/projectTemplate";
import { reconcilePersistentJobs } from "../apps/studio/src/jobReconciler";
import { approveProjectTransition } from "../apps/studio/src/transitionApproval";

async function main() {
  const api = process.env.PETLORD_API_URL ?? "http://127.0.0.1:4312";
  const projectId = process.env.PETLORD_PROJECT_ID;
  if (!projectId) throw new Error("Set PETLORD_PROJECT_ID to the local project to rebuild.");
  const identityId = "identity-qiuqiu-real-photos-v1";
  const { referencePaths: sourcePaths } = parseReferenceArguments(process.argv.slice(2));

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${api}${path}`, init);
    const text = await response.text();
    const payload = JSON.parse(text) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `${init?.method ?? "GET"} ${path} failed`);
    return payload;
  }

  async function uploadReference(path: string, index: number): Promise<Artifact> {
    const contents = await readReferenceFile(path);
    const media = await json<{ id: string; uri: string; mimeType: string }>("/api/media/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${contents.toString("base64")}` }),
    });
    return {
      id: `artifact-qiuqiu-reference-${index + 1}`,
      kind: "identity-reference",
      uri: media.uri,
      mimeType: media.mimeType,
      createdAt: new Date().toISOString(),
      provenance: "user-upload",
      label: `Reference image ${index + 1}`,
    };
  }

  const timestamp = new Date().toISOString();
  const references = await Promise.all(sourcePaths.map(uploadReference));
  const identity: IdentityProfile = {
    schemaVersion: 1,
    id: identityId,
    name: "球球",
    identityPrompt: "{{characterName}}是一只通体奶白色的中小型年轻犬：头部呈柔和楔形但口鼻较短，额头宽，黑色圆鼻，双眼大而深黑、左右对称，眼周有自然浅灰阴影；两只三角形耳朵向两侧半垂，耳缘带轻微奶油色。身体轻盈但不瘦弱，四肢较长直，胸前和颈部毛发比躯干略蓬松，尾巴蓬松并自然上扬。所有状态必须严格保持纯白毛色、半垂耳、大黑眼、黑鼻、较长四肢和蓬松尾巴，不得变成尖耳白柴、博美、萨摩耶或短腿犬。",
    referenceArtifacts: references,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const style = defaultStyleProfiles.find((candidate) => candidate.id === "style-clear-lively-2d")!;
  let project = createBlankProject({
    customerName: "",
    contact: "",
    characterName: identity.name,
    identityProfileId: identity.id,
    styleProfileId: style.id,
    projectName: "球球 · 清透真实实拍版",
    stylePrompt: style.imagePrompt,
    imageStylePrompt: style.imagePrompt,
    videoStylePrompt: style.videoPrompt,
    generationBudgetCny: 50,
    quotedPriceCny: 0,
    depositCny: 0,
    revisionLimit: 0,
    notes: "SQLite 重建项目；复用已有状态图与过渡视频。",
    projectTemplateId: "companion",
  }, identity);
  project = { ...project, id: projectId, order: { ...project.order, channel: "private" } };

  const jobs = (await json<PersistentGenerationJob[]>("/api/jobs"))
    .filter((job) => job.trigger.projectId === projectId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  project = reconcilePersistentJobs(project, jobs);

  for (const state of project.logicalStates) {
    const candidate = project.artifacts
      .filter((artifact) => artifact.kind === "state-draft" && artifact.targetStateId === state.id)
      .sort((left, right) => (left.candidateIndex ?? 0) - (right.candidateIndex ?? 0))[0];
    if (candidate) project = activateAuthorityReference(project, state.id, candidate.id);
  }
  if (project.logicalStates[0]?.referenceArtifactId) {
    project = promoteReferenceToInitialState(project, project.logicalStates[0].id);
  }
  for (const transition of project.transitions) {
    if (transition.videoArtifactId) project = approveProjectTransition(project, transition.id).project;
  }
  project = { ...project, updatedAt: new Date().toISOString() };

  await json(`/api/workspace/entities/identity/${encodeURIComponent(identity.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: identity }),
  });
  await json(`/api/workspace/entities/project/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: project }),
  });

  const state = await json<{ data: { activeProjectId: string; activeIdentityId?: string; projectIds: string[] } | null }>("/api/workspace/state/workspace-registry");
  const registry = state.data ?? { activeProjectId: project.id, projectIds: [] };
  await json("/api/workspace/state/workspace-registry", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { ...registry, activeProjectId: project.id, activeIdentityId: identity.id, projectIds: [...new Set([...registry.projectIds, project.id])] } }),
  });

  process.stdout.write(JSON.stringify({
    projectId: project.id,
    identityId: identity.id,
    references: identity.referenceArtifacts.length,
    states: project.logicalStates.filter((state) => state.referenceArtifactId).length,
    transitions: project.transitions.filter((transition) => transition.status === "approved").length,
    reusedJobs: jobs.length,
  }, null, 2));

}
await runReferenceCli(main);
