import type {PetRuntimeCore} from '@petlord/runtime-core';
import type {PetPackageManifest} from '@petlord/schema';

/** Keeps a semantic activity alive while letting finite reactions and dragging finish. */
export function createAgentActivityLoop(core:PetRuntimeCore,manifest:PetPackageManifest){
 let requested:string|null=null,suspended=false,reconciling=false,ownsMotion=false,pendingStop=false,lastTarget:string|undefined;
 function reconcile(){
  if(reconciling||suspended)return;
  const snapshot=core.getSnapshot();
  if(snapshot.phase!=='idle'||snapshot.queuedTransitionIds.length)return;
  reconciling=true;
  try{
   if(pendingStop){pendingStop=false;if(core.currentState()?.logicalStateId===lastTarget)core.jumpToState(manifest.initialStateId);}
   if(!requested)return;
   const target=manifest.semanticActions[requested];
   const current=core.currentState();
   if(current?.logicalStateId!==target){ownsMotion=core.performSemanticAction(requested).accepted;return;}
   const loop=core.outgoingTransitions().find(t=>t.toStateId===snapshot.currentStateId&&t.idleRule?.enabled);
   if(loop)ownsMotion=core.beginTransition(loop.id,'idle').accepted;
  }finally{reconciling=false;}
 }
 const unsubscribe=core.subscribe(reconcile);
 return{
  set(action:string|null){
   if(action&&!manifest.semanticActions[action])return{accepted:false,reason:`宠物没有配置 ${action} 工作动作`};
   requested=action;
   if(action)lastTarget=manifest.semanticActions[action];
   if(!action&&ownsMotion){ownsMotion=false;if(suspended)pendingStop=true;else core.jumpToState(manifest.initialStateId);}
   else reconcile();
   return{accepted:true};
  },
  suspend(value:boolean){suspended=value;if(!value)reconcile();},
  dispose(){requested=null;unsubscribe();},
 };
}
