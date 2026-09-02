import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeMediaCanvas } from "@petlord/runtime-react";
import { AgentInbox } from "./components/AgentInbox";
import { DesktopSettingsWindow } from "./components/DesktopSettingsWindow";
import { RuntimeErrorBoundary } from "./components/RuntimeErrorBoundary";
import { TodoPopover } from "./components/TodoPopover";
import { useDesktopRuntime } from "./hooks/useDesktopRuntime";
import { useDesktopSettingsWindow } from "./hooks/useDesktopSettingsWindow";
import { installRuntimeErrorReporting } from "./runtimeDiagnostics";
import "./desktopBridge";
import "./styles.css";

function PetSurface() {
  const runtime = useDesktopRuntime();
  return <main className="pet-window-root" onPointerMove={runtime.onStagePointerMove} onPointerLeave={runtime.onStagePointerLeave} onPointerUp={runtime.onPetPointerUp} onPointerCancel={runtime.onPetPointerUp}>
    {runtime.speech && <div className="pet-message-bubble" role="status">{runtime.speech}</div>}
    {runtime.agentInboxOpen && runtime.agentActivityAvailable && <AgentInbox events={runtime.agentEvents} onClose={() => runtime.setAgentInboxOpen(false)} onOpen={(id) => { void runtime.openAgentEvent(id); }} onAcknowledge={(id) => { void runtime.acknowledgeAgentEvent(id); }} onSimulate={(source) => { void runtime.simulateAgentEvent(source); }} />}
    {runtime.todoPanelOpen && runtime.todoAvailable && <TodoPopover items={runtime.items} title={runtime.title} setTitle={runtime.setTitle} onAdd={(event) => { void runtime.addItem(event); }} onComplete={(id) => { void runtime.completeItem(id); }} onRemove={(id) => { void runtime.removeItem(id); }} onClose={() => runtime.setTodoPanelOpen(false)} />}
    <div className="pet-hitarea">
      <div
        ref={runtime.petSurfaceRef}
        className={`pet-media-surface ${runtime.dragActive ? "is-dragging" : ""}`}
        style={{ width: `${runtime.settings.settings.displaySize}px`, height: `${runtime.settings.settings.displaySize}px`, transform: `translate3d(${runtime.dragOffset.x}px, ${runtime.dragOffset.y}px, 0)`, transitionDuration: `${runtime.dragTransitionMs}ms` }}
        onClick={runtime.onPetClick}
        onDoubleClick={runtime.onPetDoubleClick}
        onContextMenu={runtime.onPetContextMenu}
        onPointerDown={runtime.onPetPointerDown}
        onPointerUp={runtime.onPetPointerUp}
        onPointerCancel={runtime.onPetPointerUp}
      >
        {runtime.currentState && <RuntimeMediaCanvas
          currentState={runtime.currentState}
          activeTransition={runtime.activeTransition}
          phase={runtime.runtimePhase}
          bridgeProgress={runtime.bridgeProgress}
          playbackRunId={runtime.activeTransitionRunId}
          playbackCycleCount={runtime.activePlaybackCycles}
          frameRate={runtime.settings.settings.frameRate}
          renderResolution={runtime.settings.settings.renderResolution}
          pixelGridSize={runtime.settings.settings.pixelGridSize}
          pixelArtProfileKey={runtime.manifest?.id}
          pixelated={runtime.settings.settings.pixelated}
          pointerGaze={runtime.pointerGaze}
          pointerGazeActive={runtime.pointerGazeActive}
          pointerGazeProgress={runtime.pointerGazeProgress}
          muted={runtime.settings.settings.muted}
          className="pet-media"
          onVideoTimeUpdate={runtime.onTransitionVideoTimeUpdate}
          onVideoEnded={runtime.onTransitionVideoEnded}
        />}
      </div>
    </div>
  </main>;
}

function SettingsSurface() {
  const controller = useDesktopSettingsWindow();
  return <DesktopSettingsWindow controller={controller} />;
}

installRuntimeErrorReporting();
const surface = new URLSearchParams(window.location.search).get("surface") === "settings" ? "settings" : "pet";
document.documentElement.dataset.surface = surface;
document.title = surface === "settings" ? "PetLord 设置" : "PetLord";
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Desktop runtime root element is missing.");
const runtimeRoot = window.petLordReactRoot ?? createRoot(rootElement);
window.petLordReactRoot = runtimeRoot;
runtimeRoot.render(<StrictMode><RuntimeErrorBoundary>{surface === "settings" ? <SettingsSurface /> : <PetSurface />}</RuntimeErrorBoundary></StrictMode>);
