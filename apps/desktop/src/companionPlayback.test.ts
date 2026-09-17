import {expect,it,vi} from 'vitest';
import type {PetPackageManifest,RuntimeTransition} from '@petlord/schema';
import {createCompanionPlaybackReporter} from './companionPlayback';
it('emits one completion only for an actually finished waste animation and interrupts on reset',()=>{
 const manifest={id:'pet',semanticActions:{poop:'poop',pee:'pee',run:'run'},states:[{id:'p',logicalStateId:'poop'},{id:'s',logicalStateId:'sit'}],transitions:[{id:'enter',fromStateId:'s',toStateId:'p'},{id:'action',fromStateId:'p',toStateId:'s'}]} as unknown as PetPackageManifest;const send=vi.fn(),reporter=createCompanionPlaybackReporter(manifest,send,'session');
 const event=(id:number,type:string,transitionId?:string,source='idle')=>({id,type,transitionId,source,stateId:'s',at:id}) as any;
 const events=[event(1,'transition-started','enter'),event(2,'state-entered','enter'),event(3,'transition-started','action'),event(4,'state-entered','action')];reporter.consume([...events].reverse());reporter.consume([...events].reverse());expect(send.mock.calls.map(([v])=>[v.semanticKey,v.phase])).toEqual([['other','started'],['other','completed'],['poop','started'],['poop','completed']]);
 reporter.consume([...events,event(5,'transition-started','action'),event(6,'state-jumped')]);expect(send.mock.calls.at(-1)?.[0]).toMatchObject({semanticKey:'poop',phase:'interrupted'});
 reporter.consume([event(7,'transition-started','action','drag')]);expect(send.mock.calls.at(-1)?.[0].semanticKey).toBe('other');
});
