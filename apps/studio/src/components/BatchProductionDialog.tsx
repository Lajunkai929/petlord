import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle,
  Coins,
  FilmStrip,
  ImageSquare,
  MagicWand,
  SpinnerGap,
  Stack,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { BatchAction, BatchProductionController } from "../hooks/useBatchProduction";

const actionMeta: Record<BatchAction, { label: string; icon: typeof ImageSquare }> = {
  "generate-state": { label: "生成缺失参考图", icon: ImageSquare },
  "generate-transition": { label: "生成缺失视频", icon: FilmStrip },
  transparentize: { label: "本机透明化", icon: MagicWand },
  approve: { label: "批准已审内容", icon: CheckCircle },
};

function money(value: number) {
  return `¥${value.toFixed(2)}`;
}

export function BatchProductionDialog({ controller }: { controller: BatchProductionController }) {
  return (
    <Dialog.Root open={controller.open} onOpenChange={(open) => !controller.running && controller.setOpen(open)}>
      <Dialog.Trigger asChild><button className="ghost-button" type="button"><Stack size={15} />批量{controller.items.length > 0 && <em>{controller.items.length}</em>}</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content batch-production-dialog">
          <div className="dialog-heading"><div><Dialog.Title>批量制作台</Dialog.Title><Dialog.Description>只处理你勾选的任务；生成费用在提交前统一汇总。</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="关闭批量制作"><X size={18} /></Dialog.Close></div>
          <div className="batch-action-filters">{(Object.entries(actionMeta) as Array<[BatchAction, typeof actionMeta[BatchAction]]>).map(([action, meta]) => {
            const Icon = meta.icon;
            const count = controller.items.filter((item) => item.action === action).length;
            const selected = controller.items.filter((item) => item.action === action && controller.selectedKeys.includes(item.key)).length;
            return <button type="button" disabled={count === 0 || controller.running} className={selected > 0 ? "is-active" : ""} onClick={() => controller.selectAction(action)} key={action}><Icon size={15} /><span><strong>{meta.label}</strong><small>{selected}/{count} 已选</small></span></button>;
          })}</div>
          {controller.items.length === 0 ? <div className="batch-empty"><CheckCircle size={30} weight="thin" /><strong>当前没有待批量处理的内容</strong><span>生成完成或状态变化后，这里会自动出现下一步任务。</span></div> : <div className="batch-production-list">{controller.items.map((item) => (
            <label className={controller.selectedKeys.includes(item.key) ? "is-selected" : ""} key={item.key}>
              <input type="checkbox" checked={controller.selectedKeys.includes(item.key)} disabled={controller.running} onChange={() => controller.toggle(item.key)} />
              <span><strong>{item.label}</strong><small>{actionMeta[item.action].label} · {item.detail}</small></span>
              <em>{item.cost ? item.cost.minimumCny === item.cost.maximumCny ? money(item.cost.minimumCny) : `${money(item.cost.minimumCny)}–${money(item.cost.maximumCny)}` : "本机处理"}</em>
            </label>
          ))}</div>}
          {controller.selected.some((item) => item.action === "approve") && <p className="batch-quality-warning"><WarningCircle size={14} />批量批准不会替你检查动作质量；请只勾选已经逐条预览并确认选帧的动画。</p>}
          <div className={`batch-budget-guard ${controller.budgetExceeded ? "is-blocked" : ""}`}><span><small>项目 API 硬预算</small><strong>¥{controller.budget.committedCny.toFixed(2)} / ¥{controller.budget.limitCny.toFixed(2)}</strong></span><div><i style={{ transform: `scaleX(${controller.budget.usageRatio})` }} /></div><em>剩余 ¥{controller.budget.remainingCny.toFixed(2)}</em></div>
          <footer className="batch-production-footer">
            <div><Coins size={16} weight="fill" /><span><small>所选生成任务预计费用</small><strong>{controller.cost.minimumCny === controller.cost.maximumCny ? money(controller.cost.minimumCny) : `${money(controller.cost.minimumCny)}–${money(controller.cost.maximumCny)}`}</strong></span></div>
            <button className="primary-button" type="button" disabled={controller.selected.length === 0 || controller.running || controller.budgetExceeded} onClick={controller.execute}>{controller.running ? <SpinnerGap className="spin" size={15} /> : <Stack size={15} weight="fill" />}{controller.running ? `处理中 ${controller.progress.completed}/${controller.progress.total}` : controller.budgetExceeded ? "超过预算，已锁定" : `执行 ${controller.selected.length} 项`}</button>
          </footer>
          {controller.message && <p className="batch-complete-message">{controller.message}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
