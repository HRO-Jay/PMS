/**
 * 个税计算引擎 — 累计预扣法
 * 居民个人工资、薪金所得个人所得税预扣预缴
 */

export interface TaxBracket {
  level: number;
  min_income: number;
  max_income: number | null;
  rate: number;
  quick_deduction: number;
}

/** 七级累进预扣率表（年度累计口径） */
export const TAX_BRACKETS: TaxBracket[] = [
  { level: 1, min_income: 0, max_income: 36000, rate: 0.03, quick_deduction: 0 },
  { level: 2, min_income: 36000, max_income: 144000, rate: 0.10, quick_deduction: 2520 },
  { level: 3, min_income: 144000, max_income: 300000, rate: 0.20, quick_deduction: 16920 },
  { level: 4, min_income: 300000, max_income: 420000, rate: 0.25, quick_deduction: 31920 },
  { level: 5, min_income: 420000, max_income: 660000, rate: 0.30, quick_deduction: 52920 },
  { level: 6, min_income: 660000, max_income: 960000, rate: 0.35, quick_deduction: 85920 },
  { level: 7, min_income: 960000, max_income: null, rate: 0.45, quick_deduction: 181920 },
];

const round2 = (v: number): number => Number(v.toFixed(2));

/** 查预扣率表 */
export function findTaxBracket(cumulTaxableIncome: number): TaxBracket {
  const income = Math.max(0, cumulTaxableIncome);
  return TAX_BRACKETS.find(
    b => income >= b.min_income && (b.max_income === null || income <= b.max_income)
  ) || TAX_BRACKETS[TAX_BRACKETS.length - 1];
}

export interface TaxCalcInput {
  cumul_taxable_income: number;   // 累计应税收入
  cumul_tax_free_income: number;  // 累计免税收入
  cumul_basic_deduction: number;  // 累计减除费用（5000×月数）
  cumul_five_insurance: number;   // 累计五险一金
  cumul_special_deduct: number;   // 累计专项附加扣除
  cumul_other_deduct: number;     // 累计其他扣除
  cumul_tax_relief: number;       // 累计减免税额
  cumul_tax_paid: number;         // 累计已预扣预缴税额
}

export interface TaxCalcResult {
  cumul_taxable_income_net: number;  // 累计预扣预缴应纳税所得额
  tax_rate: number;
  quick_deduction: number;
  monthly_tax: number;               // 当月个人所得税
}

/** 累计预扣法计算 */
export function calcIncomeTax(input: TaxCalcInput): TaxCalcResult {
  // 累计预扣预缴应纳税所得额 = 累计应税收入 - 累计免税收入 - 累计减除费用 - 累计五险一金 - 累计专项附加 - 累计其他扣除
  let cumulTaxableIncomeNet =
    input.cumul_taxable_income
    - input.cumul_tax_free_income
    - input.cumul_basic_deduction
    - input.cumul_five_insurance
    - input.cumul_special_deduct
    - input.cumul_other_deduct;

  // 负值按 0
  cumulTaxableIncomeNet = Math.max(0, cumulTaxableIncomeNet);

  // 查表
  const bracket = findTaxBracket(cumulTaxableIncomeNet);

  // 当月个税 = 累计应纳税所得额 × 预扣率 - 速算扣除数 - 累计减免税额 - 累计已预扣税额
  let monthlyTax =
    cumulTaxableIncomeNet * bracket.rate
    - bracket.quick_deduction
    - input.cumul_tax_relief
    - input.cumul_tax_paid;

  // 负值按 0
  monthlyTax = Math.max(0, monthlyTax);

  return {
    cumul_taxable_income_net: round2(cumulTaxableIncomeNet),
    tax_rate: bracket.rate,
    quick_deduction: bracket.quick_deduction,
    monthly_tax: round2(monthlyTax),
  };
}
