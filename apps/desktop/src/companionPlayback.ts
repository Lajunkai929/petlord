import type {RuntimeEvent} from '@petlord/runtime-core';
import type {PetPackageManifest} from '@petlord/schema';
type Action={actionId:string;semanticKey:string;phase:'started'|'completed'|'interrupted'};
/** Emits once per real playback, independently of render rate or animation frame count. */
export function createCompanionPlaybackReporter(manifest:PetPackageManifest,send:(action:Action)=>void,sessionId:string=crypto.randomUUID()){
 let lastId=0,current:{actionId:string;semanticKey:string;transitionId:string}|undefined;
 const interrupt=()=>{if(current){send({...current,phase:'interrupted'});current=undefined;}};
 return{
  consume(events:RuntimeEvent[]){for(const event of [...events].sort((a,b)=>a.id-b.id)){if(event.id<=lastId)continue;lastId=event.id;
   if(event.type==='transition-started'&&event.transitionId){
    interrupt();const transition=manifest.transitions.find(t=>t.id===event.transitionId);const from=manifest.states.find(s=>s.id===transition?.fromStateId);
    const semanticKey=event.source==='drag'?'other':(['run','poop','pee'].find(key=>manifest.semanticActions[key]===from?.logicalStateId)??'other');
    current={actionId:`${sessionId}:${event.id}`,semanticKey,transitionId:event.transitionId};send({...current,phase:'started'});
   }else if(event.type==='state-entered'&&current&&event.transitionId===current.transitionId){send({...current,phase:'completed'});current=undefined;}
   else if(['transition-interrupted','state-jumped','runtime-reset','manifest-loaded'].includes(event.type))interrupt();
  }},
  dispose:interrupt,
 };
}
