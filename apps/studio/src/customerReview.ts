import {
  customerReviewResponseSchema,
  type CharacterProject,
  type CustomerReviewItem,
  type CustomerReviewResponse,
  type CustomerReviewRound,
} from "@petlord/schema";
import { materializeMediaUri } from "./lib/portablePetPackage";

function activeStateMedia(project: CharacterProject, logicalStateId: string) {
  const logicalState = project.logicalStates.find((state) => state.id === logicalStateId);
  const variant = project.variants.find((candidate) => candidate.id === logicalState?.defaultVariantId)
    ?? project.variants.find((candidate) => candidate.logicalStateId === logicalStateId && candidate.status === "approved")
    ?? project.variants.find((candidate) => candidate.logicalStateId === logicalStateId);
  if (variant) return { artifactId: variant.imageArtifactId, sourceLabel: "实际状态" };
  return logicalState?.referenceArtifactId ? { artifactId: logicalState.referenceArtifactId, sourceLabel: "权威参考" } : undefined;
}

export function createCustomerReviewRound(
  project: CharacterProject,
  id = `review-${crypto.randomUUID()}`,
  createdAt = new Date().toISOString(),
): CustomerReviewRound {
  const stateItems: CustomerReviewItem[] = project.logicalStates.flatMap((state) => {
    const media = activeStateMedia(project, state.id);
    return media ? [{
      id: `review-item-state-${state.id}`,
      entityType: "state" as const,
      entityId: state.id,
      label: `${state.label} · ${media.sourceLabel}`,
      mediaKind: "image" as const,
      mediaArtifactId: media.artifactId,
      decision: "pending" as const,
      comment: "",
    }] : [];
  });
  const transitionItems: CustomerReviewItem[] = project.transitions.flatMap((transition) => {
    const mediaArtifactId = transition.videoArtifactId;
    return mediaArtifactId ? [{
      id: `review-item-transition-${transition.id}`,
      entityType: "transition" as const,
      entityId: transition.id,
      label: `${transition.label} · 动画`,
      mediaKind: "video" as const,
      mediaArtifactId,
      decision: "pending" as const,
      comment: "",
    }] : [];
  });
  const items = [...stateItems, ...transitionItems];
  if (items.length === 0) throw new Error("当前项目还没有可供客户审稿的图片或视频。");
  return {
    id,
    sequence: project.order.reviewRounds.length + 1,
    createdAt,
    status: "draft",
    items,
  };
}

interface PortableReviewItem {
  id: string;
  label: string;
  entityType: "state" | "transition";
  mediaKind: "image" | "video";
  mediaUri: string;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function buildCustomerReviewHtml(
  project: CharacterProject,
  round: CustomerReviewRound,
  onProgress?: (completed: number, total: number) => void,
) {
  const items: PortableReviewItem[] = [];
  for (let index = 0; index < round.items.length; index += 1) {
    const item = round.items[index];
    const artifact = project.artifacts.find((candidate) => candidate.id === item.mediaArtifactId);
    if (!artifact) throw new Error(`审稿素材不存在：${item.label}`);
    items.push({
      id: item.id,
      label: item.label,
      entityType: item.entityType,
      mediaKind: item.mediaKind,
      mediaUri: await materializeMediaUri(artifact.uri),
    });
    onProgress?.(index + 1, round.items.length);
  }
  const payload = {
    projectId: project.id,
    roundId: round.id,
    sequence: round.sequence,
    characterName: project.characterName,
    customerName: project.order.customerName,
    orderNumber: project.order.orderNumber,
    items,
  };
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.characterName)} · 第 ${round.sequence} 轮审稿</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#342c25;background:#faf8f4}*{box-sizing:border-box}body{margin:0}button,textarea{font:inherit}header{padding:40px clamp(18px,5vw,72px) 28px;background:#f3eee6;color:#342c25}header small{color:#96602d;font-weight:700;letter-spacing:.08em}h1{max-width:800px;margin:8px 0 6px;font-size:clamp(30px,6vw,58px);letter-spacing:-.055em;line-height:1}header p{margin:0;color:#695c50}.grid{display:grid;max-width:1240px;margin:auto;padding:24px clamp(14px,4vw,48px) 120px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.card{overflow:hidden;border:1px solid #e2d9cc;border-radius:16px;background:#fff}.media{display:grid;aspect-ratio:1;place-items:center;background-color:#f1ece4;background-image:linear-gradient(45deg,#e2d9cc 25%,transparent 25%),linear-gradient(-45deg,#e2d9cc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2d9cc 75%),linear-gradient(-45deg,transparent 75%,#e2d9cc 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.media img,.media video{display:block;width:100%;height:100%;object-fit:contain}.body{padding:14px}.body h2{margin:0 0 10px;font-size:16px}.choice{display:flex;gap:6px}.choice button{min-height:38px;flex:1;border:1px solid #e2d9cc;border-radius:9px;background:#fffdfa;color:#695c50;cursor:pointer}.choice button.approved.active{border-color:#96602d;background:#f6e8cf;color:#96602d}.choice button.changes.active{border-color:#ca8453;background:#fff0e5;color:#a25121}textarea{width:100%;min-height:76px;margin-top:8px;padding:9px;border:1px solid #e2d9cc;border-radius:9px;resize:vertical}.submit{position:fixed;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,5vw,72px);border-top:1px solid #e2d9cc;background:rgba(255,255,255,.94);backdrop-filter:blur(12px)}.submit span{color:#7b6d60;font-size:13px}.submit button{min-height:42px;padding:0 18px;border:0;border-radius:10px;background:#96602d;color:#fffbf4;font-weight:700;cursor:pointer}.submit button:disabled{opacity:.4;cursor:not-allowed}.error{color:#a25121!important}@media(max-width:620px){.grid{grid-template-columns:1fr}.submit{align-items:stretch;flex-direction:column}.submit button{width:100%}}
</style></head><body><header><small>PET LORD · 客户审稿</small><h1 id="title"></h1><p id="subtitle"></p></header><main class="grid" id="app"></main><footer class="submit"><span id="progress"></span><button id="download" disabled>全部确认后，下载反馈文件</button></footer>
<script id="payload" type="application/json">${safeJson(payload)}</script><script>
const p=JSON.parse(document.getElementById('payload').textContent);const result=new Map(p.items.map(i=>[i.id,{id:i.id,decision:'',comment:''}]));
document.getElementById('title').textContent=p.characterName+' · 第 '+p.sequence+' 轮审稿';document.getElementById('subtitle').textContent=(p.customerName?p.customerName+'，':'')+'请逐项确认图片与动画。需要调整时请写清具体位置和期望。';
const app=document.getElementById('app'),progress=document.getElementById('progress'),download=document.getElementById('download');
function sync(){const values=[...result.values()],done=values.filter(v=>v.decision).length,missing=values.some(v=>v.decision==='changes'&&!v.comment.trim());progress.textContent='已确认 '+done+' / '+values.length+(missing?' · “需修改”必须填写意见':'');progress.className=missing?'error':'';download.disabled=done!==values.length||missing}
for(const item of p.items){const card=document.createElement('article');card.className='card';const media=document.createElement('div');media.className='media';const el=document.createElement(item.mediaKind==='video'?'video':'img');el.src=item.mediaUri;if(item.mediaKind==='video'){el.controls=true;el.muted=true;el.playsInline=true}else el.alt=item.label;media.append(el);const body=document.createElement('div');body.className='body';const h=document.createElement('h2');h.textContent=item.label;const choice=document.createElement('div');choice.className='choice';for(const [decision,label] of [['approved','通过'],['changes','需修改']]){const b=document.createElement('button');b.className=decision;b.textContent=label;b.onclick=()=>{result.get(item.id).decision=decision;choice.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');sync()};choice.append(b)}const note=document.createElement('textarea');note.placeholder='修改意见（选择“需修改”时必填）';note.oninput=()=>{result.get(item.id).comment=note.value;sync()};body.append(h,choice,note);card.append(media,body);app.append(card)}
download.onclick=()=>{const response={format:'petlord-review-response',version:1,projectId:p.projectId,roundId:p.roundId,customerName:p.customerName||'',respondedAt:new Date().toISOString(),items:[...result.values()]};const url=URL.createObjectURL(new Blob([JSON.stringify(response,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=p.characterName+'-review-round-'+p.sequence+'-response.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};sync();
</script></body></html>`;
}

export function parseCustomerReviewResponse(contents: string) {
  return customerReviewResponseSchema.parse(JSON.parse(contents));
}

export function applyCustomerReviewResponse(
  project: CharacterProject,
  response: CustomerReviewResponse,
): CharacterProject {
  if (response.projectId !== project.id) throw new Error("反馈文件不属于当前客户项目。");
  const round = project.order.reviewRounds.find((candidate) => candidate.id === response.roundId);
  if (!round) throw new Error("找不到反馈文件对应的审稿轮次。");
  const byId = new Map(response.items.map((item) => [item.id, item]));
  if (byId.size !== round.items.length || round.items.some((item) => !byId.has(item.id))) {
    throw new Error("反馈文件的审稿项目不完整。");
  }
  const requestedChanges = response.items.some((item) => item.decision === "changes");
  const firstResponse = round.status !== "responded";
  const reviewRounds = project.order.reviewRounds.map((candidate) => candidate.id === round.id ? {
    ...candidate,
    status: "responded" as const,
    respondedAt: response.respondedAt,
    items: candidate.items.map((item) => {
      const feedback = byId.get(item.id)!;
      return { ...item, decision: feedback.decision, comment: feedback.comment };
    }),
  } : candidate);
  return {
    ...project,
    order: {
      ...project.order,
      status: requestedChanges ? "revision" : "ready",
      revisionUsed: requestedChanges && firstResponse ? Math.min(99, project.order.revisionUsed + 1) : project.order.revisionUsed,
      reviewRounds,
      deliveryChecklist: { ...project.order.deliveryChecklist, customerApproved: !requestedChanges },
    },
    updatedAt: response.respondedAt,
  };
}
