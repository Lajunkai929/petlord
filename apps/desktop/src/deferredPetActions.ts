type ActionResult={accepted:boolean;reason?:string};
/** Salient plugin reactions wait until the user has put the pet down. */
export function createDeferredPetActions(blocked:()=>boolean,perform:(action:string)=>Promise<ActionResult>){
 let pending:string|undefined;
 return{
  async perform(action:string){if(blocked()){pending=action;return{accepted:true};}pending=undefined;return perform(action);},
  async flush(){if(blocked()||!pending)return;const action=pending;pending=undefined;return perform(action);},
  clear(){pending=undefined;},
 };
}
