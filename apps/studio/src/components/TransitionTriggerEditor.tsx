import { SelectField, Popconfirm, Button, Input, Checkbox } from "@petlord/ui";
import { CursorClick, HandPointing, HourglassMedium, MouseLeftClick, MouseRightClick, MouseSimple, Plus, Timer, Trash } from "@phosphor-icons/react";

import type { Artifact, TransitionTrigger } from "@petlord/schema";
import { useTransitionTriggerEditor } from "../hooks/useTransitionTriggerEditor";

interface TransitionTriggerEditorProps {
  sourceImage?: string;
  nativePixel?: Artifact["nativePixel"];
  triggers: TransitionTrigger[];
  onChange: (triggers: TransitionTrigger[]) => void;
}

const eventText: Record<TransitionTrigger["event"], string> = {
  hover: "鼠标 Hover",
  "pointer-leave": "鼠标移出宠物",
  "left-click": "鼠标左键",
  "right-click": "鼠标右键",
  "double-click": "鼠标双击",
  inactivity: "无交互达到",
  "state-timeout": "进入状态达到",
};

function isTimedEvent(event: TransitionTrigger["event"]) {
  return event === "inactivity" || event === "state-timeout";
}

function EventIcon({ event }: { event: TransitionTrigger["event"] }) {
  if (event === "left-click") return <MouseLeftClick size={16} />;
  if (event === "right-click") return <MouseRightClick size={16} />;
  if (event === "double-click") return <MouseSimple size={16} />;
  if (event === "inactivity") return <Timer size={16} />;
  if (event === "state-timeout") return <HourglassMedium size={16} />;
  return <HandPointing size={16} />;
}

export function TransitionTriggerEditor({ sourceImage, nativePixel, triggers, onChange }: TransitionTriggerEditorProps) {
  const editor = useTransitionTriggerEditor(triggers, onChange);
  const active = editor.active;
  return (
    <section className="trigger-editor">
      <header className="trigger-editor-heading">
        <div><CursorClick size={18} weight="fill" /><div><strong>触发条件</strong><span>条件属于这条过渡线</span></div></div>
        <Button type="text" htmlType="button" className="tertiary-button" onClick={() => editor.add()}><Plus size={14} />添加</Button>
      </header>
      {triggers.length === 0 ? (
        <button type="button" className="trigger-empty" onClick={() => editor.add()}><CursorClick size={24} weight="thin" /><strong>添加左键单击</strong><span>默认：单击宠物热区后播放这段动作。也可以改为定时或其他事件。</span></button>
      ) : (
        <>
          <div className="trigger-tabs">
            {triggers.map((trigger, index) => (
              <button type="button" className={trigger.id === active?.id ? "is-active" : ""} onClick={() => editor.setActiveId(trigger.id)} key={trigger.id}>
                <EventIcon event={trigger.event} /><span>{eventText[trigger.event]}</span><em>{index + 1}</em>
              </button>
            ))}
          </div>
          {active && (
            <div className="trigger-config">
              <div className="trigger-form-row">
                <label><span>事件</span><SelectField value={active.event} onChange={(event) => editor.changeEvent(event.target.value as TransitionTrigger["event"])}><optgroup label="低频自动转换"><option value="inactivity">无交互达到</option><option value="state-timeout">进入状态达到</option></optgroup><optgroup label="鼠标交互"><option value="double-click">鼠标双击</option><option value="hover">Hover</option><option value="pointer-leave">鼠标移出宠物</option><option value="left-click">鼠标左键点击</option><option value="right-click">鼠标右键点击</option></optgroup></SelectField></label>
                {active.event === "hover" && <label><span>停留时长</span><div className="duration-input"><Input type="number" min={0.1} max={30} step={0.1} value={(active.hoverDurationMs ?? 800) / 1000} onChange={(event) => editor.changeHoverSeconds(Number(event.target.value))} /><em>秒</em></div></label>}
                {isTimedEvent(active.event) && <label><span>等待时长</span><div className="duration-input"><Input type="number" min={1} max={86400} step={1} value={(active.timerDurationMs ?? 60_000) / 1000} onChange={(event) => editor.changeTimerSeconds(Number(event.target.value))} /><em>秒</em></div></label>}
              </div>
              {active.event === "hover" && <Checkbox className="trigger-repeat-toggle" checked={active.repeatWhileHovered ?? false} onChange={(event) => editor.patch(active.id, { repeatWhileHovered: event.target.checked })}><span><strong>悬停时循环</strong></span></Checkbox>}
              {isTimedEvent(active.event) ? (
                <div className="trigger-timer-note">
                  {active.event === "inactivity" ? <Timer size={17} /> : <HourglassMedium size={17} />}
                  <div><strong>{active.event === "inactivity" ? "交互后重新计时" : "固定计时"}</strong></div>
                </div>
              ) : active.event === "pointer-leave" ? (
                <div className="trigger-timer-note"><CursorClick size={17} /><div><strong>鼠标离开整个宠物区域时触发</strong><span>无需圈选热区。若当前正在播放悬停循环，会等本轮视频结束后再执行离开过渡。</span></div></div>
              ) : <>
                <div className="trigger-region-heading">
                  <div><strong>响应热区</strong><span>在宠物图上拖动圈选</span></div>
                  <div className="shape-switch"><button type="button" className={active.region?.shape !== "rectangle" ? "is-active" : ""} onClick={() => editor.changeShape("ellipse")}>椭圆</button><button type="button" className={active.region?.shape === "rectangle" ? "is-active" : ""} onClick={() => editor.changeShape("rectangle")}>矩形</button></div>
                </div>
                <div style={nativePixel ? { aspectRatio: `${nativePixel.width} / ${nativePixel.height}` } : undefined} className={`trigger-region-canvas checkerboard ${editor.drawing ? "is-drawing" : ""}`} onPointerDown={editor.beginRegion} onPointerMove={editor.updateRegion} onPointerUp={editor.endRegion}>
                  {sourceImage && <img style={{ display: "block", imageRendering: nativePixel ? "pixelated" : "auto" }} src={sourceImage} alt="过渡起始实际展示图" draggable={false} />}
                  {active.region && <span className={`trigger-hotspot is-${active.region.shape}`} style={{ left: `${active.region.x * 100}%`, top: `${active.region.y * 100}%`, width: `${active.region.width * 100}%`, height: `${active.region.height * 100}%` }}><i>{eventText[active.event]}</i></span>}
                </div>
              </>}
              <footer className="trigger-config-footer">
                <Checkbox className="toggle-label" checked={active.enabled} onChange={(event) => editor.setEnabled(event.target.checked)}><span>启用该条件</span></Checkbox>
                <Popconfirm title="删除这个触发条件？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => editor.remove(active.id)}>
                  <Button type="text" htmlType="button" className="danger-text-button"><Trash size={14} />删除条件</Button>
                </Popconfirm>
              </footer>
            </div>
          )}
        </>
      )}
    </section>
  );
}
