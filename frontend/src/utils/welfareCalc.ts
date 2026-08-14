/**
 * 社保/公积金计算引擎
 *
 * 根据福利套规则 + 基数，计算个人/公司各险种金额，支持取整、基数上下限、试算。
 */

export type RoundMethod = 'ROUND' | 'ROUNDUP' | 'ROUNDDOWN' | 'TRUNC_UP';

export interface SocialWelfareSet {
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  base_min?: number | null;
  base_max?: number | null;
  pension_enabled: boolean;
  medical_enabled: boolean;
  unemployment_enabled: boolean;
  injury_enabled: boolean;
  maternity_enabled: boolean;
  pension_rate_p: number;
  medical_rate_p: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  pension_rate_c: number;
  medical_rate_c: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  rounding_method: RoundMethod;
  rounding_precision: number;
}

export interface HousingFundSet {
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  base_min?: number | null;
  base_max?: number | null;
  normal_rate_p: number;
  normal_rate_c: number;
  supp_enabled: boolean;
  supp_rate_p: number;
  supp_rate_c: number;
  normal_round_method: RoundMethod;
  normal_round_precision: number;
  supp_round_method: RoundMethod;
  supp_round_precision: number;
}

/** 取整函数 */
function roundBy(method: RoundMethod, value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  const v = value * factor;
  switch (method) {
    case 'ROUND':
      return Math.round(v) / factor;
    case 'ROUNDUP':
      return Math.ceil(v) / factor;
    case 'ROUNDDOWN':
      return Math.floor(v) / factor;
    case 'TRUNC_UP':
      // 截位后进位：如 1.234 保留2位 → 1.24（截断后末位进1）
      return (Math.trunc(v) + 1) / factor;
    default:
      return Math.round(v) / factor;
  }
}

/** 应用基数上下限 */
function clampBase(base: number, min?: number | null, max?: number | null): number {
  let b = base;
  if (min != null && b < min) b = min;
  if (max != null && b > max) b = max;
  return b;
}

/** 计算社保各险种金额 */
export function calcSocial(
  set: SocialWelfareSet,
  rawBase: number,
): {
  base: number;
  pension_p: number;
  medical_p: number;
  unemployment_p: number;
  pension_c: number;
  medical_c: number;
  unemployment_c: number;
  injury_c: number;
  maternity_c: number;
  personal_total: number;
  company_total: number;
} {
  const base = clampBase(rawBase, set.base_min, set.base_max);
  const r = set.rounding_method;
  const p = set.rounding_precision;

  const pension_p = set.pension_enabled ? roundBy(r, base * set.pension_rate_p, p) : 0;
  const medical_p = set.medical_enabled
    ? roundBy(r, base * set.medical_rate_p + (set.medical_fixed_p || 0), p)
    : 0;
  const unemployment_p = set.unemployment_enabled
    ? roundBy(r, base * set.unemployment_rate_p, p)
    : 0;
  const pension_c = set.pension_enabled ? roundBy(r, base * set.pension_rate_c, p) : 0;
  const medical_c = set.medical_enabled ? roundBy(r, base * set.medical_rate_c, p) : 0;
  const unemployment_c = set.unemployment_enabled
    ? roundBy(r, base * set.unemployment_rate_c, p)
    : 0;
  const injury_c = set.injury_enabled ? roundBy(r, base * set.injury_rate_c, p) : 0;
  const maternity_c = set.maternity_enabled ? roundBy(r, base * set.maternity_rate_c, p) : 0;

  const personal_total = pension_p + medical_p + unemployment_p;
  const company_total = pension_c + medical_c + unemployment_c + injury_c + maternity_c;

  return {
    base,
    pension_p, medical_p, unemployment_p,
    pension_c, medical_c, unemployment_c, injury_c, maternity_c,
    personal_total, company_total,
  };
}

/** 计算公积金各金额 */
export function calcHousingFund(
  set: HousingFundSet,
  rawNormalBase: number,
  suppBase?: number | null,
  suppEnabled?: boolean,
): {
  normal_base: number;
  supp_base: number;
  normal_p: number;
  normal_c: number;
  supp_p: number;
  supp_c: number;
  personal_total: number;
  company_total: number;
} {
  const normal_base = clampBase(rawNormalBase, set.base_min, set.base_max);
  const normal_p = roundBy(set.normal_round_method, normal_base * set.normal_rate_p, set.normal_round_precision);
  const normal_c = roundBy(set.normal_round_method, normal_base * set.normal_rate_c, set.normal_round_precision);

  const isSupp = suppEnabled ?? set.supp_enabled;
  const sb = clampBase(suppBase ?? normal_base, set.base_min, set.base_max);
  const supp_p = isSupp ? roundBy(set.supp_round_method, sb * set.supp_rate_p, set.supp_round_precision) : 0;
  const supp_c = isSupp ? roundBy(set.supp_round_method, sb * set.supp_rate_c, set.supp_round_precision) : 0;

  const personal_total = normal_p + supp_p;
  const company_total = normal_c + supp_c;

  return { normal_base, supp_base: isSupp ? sb : 0, normal_p, normal_c, supp_p, supp_c, personal_total, company_total };
}

/** 试算（供福利套设置页预览用） */
export function calcPreview(
  socialSet: SocialWelfareSet,
  housingSet: HousingFundSet,
  socialBase: number,
  housingBase: number,
): {
  social: ReturnType<typeof calcSocial>;
  housing: ReturnType<typeof calcHousingFund>;
  personal_total: number;
  company_total: number;
} {
  const social = calcSocial(socialSet, socialBase);
  const housing = calcHousingFund(housingSet, housingBase);
  return {
    social,
    housing,
    personal_total: social.personal_total + housing.personal_total,
    company_total: social.company_total + housing.company_total,
  };
}
