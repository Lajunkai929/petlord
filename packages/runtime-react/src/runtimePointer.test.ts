// @vitest-environment happy-dom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { petPackageManifestSchema } from "@petlord/schema";
import { usePetRuntime, type PetRuntimeReactController } from "./index";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
});
async function mount(events: ("left-click" | "double-click")[], nativeGaze = false, autonomous = false, draggable = false) {
  vi.useFakeTimers();
  const manifest = petPackageManifestSchema.parse({
    manifestVersion: 1,
    id: "pointer",
    name: "Pointer",
    characterName: "Pet",
    initialStateId: "a",
    states: [
      {
        id: "a",
        logicalStateId: "a",
        label: "A",
        imageUri: "/a.png",
        origin: "initial",
        ...(nativeGaze ? {nativePixel:{width:3,height:2}} : {}),
      },
      {
        id: "b",
        logicalStateId: "b",
        label: "B",
        imageUri: "/b.png",
        origin: "reference",
      },
    ],
    ...(draggable ? {dragInteraction:{enabled:true,targetStateId:"b",anchor:{x:.4,y:.5}}} : {}),
    transitions: [
      ...(draggable ? [{id:"drag-return",fromStateId:"b",toStateId:"a",videoUri:"/return.webm",tailFrameUri:"/a.png",durationMs:1000,authorityBridge:{mode:"hard-cut",durationMs:120}}] : []),
      ...events.map((event) => ({
        id: event,
        fromStateId: "a",
        toStateId: "b",
        videoUri: "/clip.webm",
        tailFrameUri: "/b.png",
        durationMs: 1000,
        triggers: [{ id: event, event, enabled: true }],
      })),
      {
        id: "loop",
        fromStateId: "a",
        toStateId: "a",
        videoUri: "/loop.webm",
        tailFrameUri: "/a.png",
        durationMs: 3000,
        ...(autonomous ? {idleRule:{enabled:true,weight:1,cooldownMs:0}} : {}),
      },
    ],
    logicalStates: [
      {
        id: "a",
        label: "A",
        variantIds: ["a"],
        idleScheduler: autonomous ? {enabled:true,playbackMode:"continuous"} : {},
        pointerGaze: {
          enabled: true,
          motionTarget: "head",
          activationRadius: 1.4,
          ...(nativeGaze ? {nativeImageUris:Array.from({length:8},(_,i)=>`/gaze-${i}.png`)} : {videoUri: "/gaze.webm"}),
          blendDurationMs: 0,
        },
      },
      { id: "b", label: "B", variantIds: ["b"], idleScheduler: {} },
    ],
    semanticActions: {},
    plugins: [],
  });
  let controller: PetRuntimeReactController;
  let renders = 0;
  function Harness() {
    controller = usePetRuntime(manifest);
    renders++;
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(Harness)));
  return { runtime: () => controller!, renders: () => renders };
}
it("dispatches a single-click-only state synchronously without a double-click timer", async () => {
  const f = await mount(["left-click"]);
  await act(async () => f.runtime().onClick({ x: 0.5, y: 0.5 }));
  expect(f.runtime().snapshot.activeTransitionId).toBe("left-click");
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves explicit double-click arbitration and suppresses the pending single", async () => {
  const f = await mount(["left-click", "double-click"]);
  await act(async () => f.runtime().onClick({ x: 0.5, y: 0.5 }));
  await act(async () => vi.advanceTimersByTime(259));
  expect(f.runtime().snapshot.activeTransitionId).toBeNull();
  await act(async () => f.runtime().onDoubleClick({ x: 0.5, y: 0.5 }));
  await act(async () => vi.advanceTimersByTime(500));
  expect(f.runtime().snapshot.activeTransitionId).toBe("double-click");
});
it("does not create a no-op single-click timer for double-click-only states", async () => {
  const f = await mount(["double-click"]);
  await act(async () => f.runtime().onClick({ x: 0.5, y: 0.5 }));
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels a deferred click when a newer transition interrupts the gesture", async () => {
  const f = await mount(["left-click", "double-click"]);
  await act(async () => f.runtime().onClick({ x: 0.5, y: 0.5 }));
  await act(async () => f.runtime().beginTransition("loop"));
  await act(async () => vi.advanceTimersByTime(300));
  expect(f.runtime().snapshot.activeTransitionId).toBe("loop");
});
it("does not rerender for repeated stationary global pointer positions", async () => {
  const f = await mount([]);
  await act(async () =>
    f
      .runtime()
      .onPointerMove(
        { x: 1, y: 0.5 },
        { forceGaze: true, trackInteractions: false },
      ),
  );
  await act(async () =>
    f
      .runtime()
      .onPointerMove(
        { x: 1, y: 0.5 },
        { forceGaze: true, trackInteractions: false },
      ),
  );
  const before = f.renders();
  for (let i = 0; i < 10; i++)
    await act(async () =>
      f
        .runtime()
        .onPointerMove(
          { x: 1, y: 0.5 },
          { forceGaze: true, trackInteractions: false },
        ),
    );
  expect(f.renders()).toBe(before);
  expect(f.runtime().pointerGazeProgress).toBe(0.5);
});

it("activates native gaze, yields to explicit actions and exits immediately", async () => {
 const f=await mount([],true);
 await act(async()=>f.runtime().onPointerMove({x:0,y:.5},{trackInteractions:false}));
 expect(f.runtime().pointerGazeActive).toBe(true);
 expect(f.runtime().pointerGazeProgress).toBe(0);
 await act(async()=>f.runtime().onPointerLeave());
 expect(f.runtime().pointerGazeActive).toBe(false);
 await act(async()=>f.runtime().onPointerMove({x:0,y:.5},{trackInteractions:false}));
 expect(f.runtime().pointerGazeActive).toBe(true);
 await act(async()=>f.runtime().beginTransition("loop"));
 expect(f.runtime().pointerGazeActive).toBe(false);
 await act(async()=>f.runtime().onPointerMove({x:1,y:.5},{trackInteractions:false}));
 expect(f.runtime().pointerGazeActive).toBe(false);
});
it('lets native gaze pause autonomous idle animation, publishes the pause and resumes after pointer exit',async()=>{
 const f=await mount([],true,true);
 await act(async()=>vi.advanceTimersByTime(25));
 expect(f.runtime().snapshot.phase).toBe('video');
 await act(async()=>f.runtime().onPointerMove({x:0,y:.5},{trackInteractions:false}));
 expect(f.runtime().pointerGazeActive).toBe(true);
 expect(f.runtime().snapshot.phase).toBe('idle');
 expect(f.runtime().snapshot.activeTransitionId).toBeNull();
 await act(async()=>f.runtime().onPointerLeave());
 expect(f.runtime().pointerGazeActive).toBe(false);
 await act(async()=>vi.advanceTimersByTime(25));
 expect(f.runtime().snapshot.phase).toBe('video');
});

it('forces a drag pose during a noninterruptible action and retains return-pending until the reverse finishes',async()=>{
 const f=await mount(['left-click'],true,false,true);
 await act(async()=>f.runtime().beginTransition('left-click'));
 expect(f.runtime().snapshot.phase).toBe('video');
 let accepted=false;
 await act(async()=>{accepted=f.runtime().beginDrag().accepted;});
 expect(accepted).toBe(true);
 expect(f.runtime().dragActive).toBe(true);
 expect(f.runtime().snapshot.currentStateId).toBe('b');
 expect(f.runtime().snapshot.phase).toBe('idle');
 await act(async()=>f.runtime().endDrag());
 expect(f.runtime().dragActive).toBe(false);
 expect(f.runtime().dragReturnPending).toBe(true);
 expect(f.runtime().snapshot.activeTransitionId).toBe('drag-return');
 await act(async()=>f.runtime().core!.finishVideo());
 expect(f.runtime().snapshot.currentStateId).toBe('a');
 expect(f.runtime().dragReturnPending).toBe(false);
});
it('does not mark dragging active if neither the direct transition nor forced pose is accepted',async()=>{
 const f=await mount(['left-click'],true,false,true);
 await act(async()=>f.runtime().beginTransition('left-click'));
 const jump=vi.spyOn(f.runtime().core!,'jumpToState').mockReturnValue({accepted:false,reason:'Target unavailable'});
 try{
  let result;
  await act(async()=>{result=f.runtime().beginDrag();});
  expect(result).toMatchObject({accepted:false});
  expect(f.runtime().dragActive).toBe(false);
  expect(f.runtime().dragReturnPending).toBe(false);
 }finally{jump.mockRestore();}
});
