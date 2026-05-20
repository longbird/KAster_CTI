export interface AgentGroupDistributionRule {
  queueId: string;
  queueName: string;
  queueDisplayName?: string | null;
}

export function getDistributionRuleLabels(rules?: AgentGroupDistributionRule[] | null) {
  return (rules ?? []).map((rule) => rule.queueDisplayName ?? rule.queueName);
}
