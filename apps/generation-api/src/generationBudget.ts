import type { CharacterProject } from "@petlord/schema";
import type { PersistentGenerationJob } from "@petlord/generation";
import { DesignError } from "@petlord/design-core";

export function assertGenerationBudget(project: CharacterProject, jobs: PersistentGenerationJob[], additional: number | undefined) {
  if (additional === undefined) throw new DesignError("PRICE_UNAVAILABLE", "请在模型服务中补充此模型的预估费用，再生成。");
  if (!Number.isFinite(additional) || additional < 0 || !Number.isFinite(project.generationBudgetCny) || project.generationBudgetCny <= 0) {
    throw new DesignError("INVALID_INPUT", "生成费用或项目预算必须是有效的有限金额。");
  }
  // A failed response does not prove that the Provider charged nothing.
  const reserved = jobs.filter(job => job.trigger.projectId === project.id).reduce((sum, job) => {
    const prior = job.cost?.priorAttemptsReservedCny ?? 0;
    const current = job.cost?.actualCny ?? job.cost?.estimatedMaxCny ?? 0;
    if (!Number.isFinite(prior) || prior < 0 || !Number.isFinite(current) || current < 0) throw new DesignError("INVALID_INPUT", "已有生成任务的费用记录无效，无法检查预算。");
    return sum + prior + current;
  }, 0);
  if (!Number.isFinite(reserved)) throw new DesignError("INVALID_INPUT", "已有生成任务的累计费用无效，无法检查预算。");
  if (reserved + additional > project.generationBudgetCny + 1e-9) throw new DesignError("BUDGET_EXCEEDED", "Generation would exceed this project's configured budget, including uncertain failed attempts.", { budgetCny: project.generationBudgetCny, reservedOrSpentCny: reserved, estimatedAdditionalCny: additional });
}
