export type VariableValueType = 'number' | 'string' | 'boolean';

export interface DiagramVariable {
  id: string;
  name: string;
  value: number | string | boolean;
  valueType: VariableValueType;
  unit?: string;
  source: 'manual' | 'csv';
  updatedAt: number;
  updatedBy: string;
}

export type StyleRuleOp = '<' | '<=' | '>' | '>=' | '==' | 'between';

export interface StyleRule {
  id: string;
  op: StyleRuleOp;
  value: number;
  value2?: number; // only for 'between'
  style: {
    fill?: string;
    opacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
  };
}

export interface DataBinding {
  variableId: string;
  rules: StyleRule[]; // evaluated top-to-bottom, first match wins
  fallbackStyle?: StyleRule['style'];
}
