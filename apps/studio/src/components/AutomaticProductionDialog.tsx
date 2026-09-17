import { DialogContent, Button, Dialog } from "@petlord/ui";
import { CheckCircle, FilmStrip, Images, MagicWand, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import type { AutomaticProductionController } from "../hooks/useAutomaticProduction";

export function AutomaticProductionDialog({ controller }: { controller: AutomaticProductionController }) {
  const running = controller.run?.status === "running";
  return (
    <Dialog.Root open={controller.open} onOpenChange={controller.setOpen}>
      <Dialog.Trigger asChild><Button type={running ? "text" : "primary"} className={running ? "ghost-button is-running" : "primary-button"} htmlType="button" disabled={controller.total === 0}>{running ? <SpinnerGap className="spin" size={15} /> : <MagicWand size={15} weight="fill" />}{running ? `${controller.completed}/${controller.total}` : "自动制作"}</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content automatic-production-dialog">
          <div className="dialog-heading"><div><Dialog.Title>{controller.run ? "自动制作进度" : "一键生成全部图片与视频"}</Dialog.Title><Dialog.Description>按模板顺序生成状态图，自动采用每个状态的第一张候选，再继续生成所有过渡视频。</Dialog.Description></div><Dialog.Close asChild><Button type="text" htmlType="button" className="icon-button" aria-label="关闭"><X size={18} /></Button></Dialog.Close></div>
          <div className="automatic-production-flow"><article><Images size={20} weight="duotone" /><span><strong>1. 权威状态图</strong><small>逐个提交图片候选组</small></span></article><i /><article><CheckCircle size={20} weight="duotone" /><span><strong>2. 自动选首张</strong><small>绑定模板的首尾参考</small></span></article><i /><article><FilmStrip size={20} weight="duotone" /><span><strong>3. 全部过渡</strong><small>逐条提交过渡视频</small></span></article></div>
          <p className="automatic-production-caveat"><WarningCircle size={16} weight="fill" />自动模式会直接采用每个状态的第一张候选。所有候选和视频历史仍会保留，完成后可以重新选图或重做单条动画。</p>
          <div className={`automatic-production-budget ${controller.budgetExceeded || controller.unknownPrice ? "is-blocked" : ""}`}><span><small>当前剩余额度</small><strong>¥{controller.budget.remainingCny.toFixed(2)}</strong></span><span><small>完整流程最高预估</small><strong>{controller.unknownPrice ? "费用待配置" : `¥${controller.estimatedCost.maximumCny.toFixed(2)}`}</strong></span></div>
          {controller.blockedReason && <p className="automatic-production-blocked"><WarningCircle size={15} weight="fill" />{controller.blockedReason}</p>}
          {controller.run && <section className={`automatic-production-status is-${controller.run.status}`}><div><strong>{controller.stage}</strong><span>{controller.completed}/{controller.total}</span></div><div><i style={{ transform: `scaleX(${controller.total ? controller.completed / controller.total : 0})` }} /></div></section>}
          <footer>{controller.run && <Button type="default" className="secondary-button" htmlType="button" onClick={controller.stop}>停止自动推进</Button>}<Button type="primary" className="primary-button" htmlType="button" disabled={running || Boolean(controller.blockedReason)} onClick={controller.start}><MagicWand size={15} weight="fill" />{controller.blockedReason ? "暂时无法开始" : controller.run?.status === "failed" ? "重新开始缺失任务" : "确认并开始自动制作"}</Button></footer>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
