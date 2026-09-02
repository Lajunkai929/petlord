import { Coins } from "@phosphor-icons/react";
import type { CostEstimate } from "@petlord/generation";

function money(value: number) {
  return `¥${value.toFixed(2)}`;
}

export function GenerationCostNotice({ estimate }: { estimate: CostEstimate | null }) {
  return (
    <aside className="generation-cost">
      <Coins size={18} weight="fill" />
      <div>
        <span>本次预计消耗</span>
        <strong>{estimate
          ? estimate.minimumCny === estimate.maximumCny
            ? money(estimate.minimumCny)
            : `${money(estimate.minimumCny)}–${money(estimate.maximumCny)}`
          : "暂缺公开价格"}</strong>
        <small>{estimate?.basis ?? "提交前请以火山方舟控制台实时价格为准"} · 最终账单可能因实际输出数量和 token 略有差异</small>
      </div>
    </aside>
  );
}
