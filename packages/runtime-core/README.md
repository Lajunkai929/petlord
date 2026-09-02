# @petlord/runtime-core

Framework-independent runtime for a published PetLord pet package.

The package intentionally has no React, DOM, browser-storage, Electron, Node.js, media-player, or plugin-registry dependency. It owns only deterministic pet behavior:

- exact state-variant identity;
- transition and semantic-action queues;
- pointer-trigger matching;
- inactivity and state-timeout schedules;
- weighted idle animation scheduling and cooldowns;
- video, authority-bridge, and settled-state phases;
- state entry, reset, rejection, and diagnostic events.

```ts
import { PetRuntimeCore } from "@petlord/runtime-core";

const runtime = new PetRuntimeCore(manifest);
runtime.subscribe(() => render(runtime.getSnapshot()));

runtime.activatePointer("double-click", { x: 0.5, y: 0.5 });
runtime.videoTimeReached(2400);
runtime.advanceBridge(Date.now());
runtime.performSemanticAction("greet");
```

Hosts remain responsible for playing media, translating real pointer coordinates into normalized points, scheduling wakeups, and persisting user/plugin settings. The shared `@petlord/runtime-react` adapter implements those concerns for both Studio preview and the current desktop app.

The package boundary is ready to move into a future public desktop repository without bringing Studio, generation-provider, order, or customer data code with it. A public license should be chosen explicitly when that repository is created.
