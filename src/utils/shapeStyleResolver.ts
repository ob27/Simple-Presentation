import type { DataBinding, DiagramVariable, StyleRule } from '../types/variables';

export interface ResolvedStyle {
  fill?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

function matches(rule: StyleRule, value: number): boolean {
  switch (rule.op) {
    case '<': return value < rule.value;
    case '<=': return value <= rule.value;
    case '>': return value > rule.value;
    case '>=': return value >= rule.value;
    case '==': return value === rule.value;
    case 'between': return value >= rule.value && value <= (rule.value2 ?? rule.value);
    default: return false;
  }
}

// First matching rule wins, like conditional formatting. Non-numeric variable
// values never match any rule (thresholds are numeric-only in v1).
export function resolveStyle(
  dataBinding: DataBinding | undefined,
  variables: DiagramVariable[],
): ResolvedStyle | undefined {
  if (!dataBinding) return undefined;
  const variable = variables.find(v => v.id === dataBinding.variableId);
  if (!variable || typeof variable.value !== 'number') return dataBinding.fallbackStyle;
  for (const rule of dataBinding.rules) {
    if (matches(rule, variable.value)) return rule.style;
  }
  return dataBinding.fallbackStyle;
}
