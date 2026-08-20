/**
 * 考勤计算引擎
 *
 * 根据考勤数据 + 花名册字段，自动计算各假期金额、加班金额、入离职调整、特殊调整和合计。
 * 所有金额四舍五入保留两位小数。
 */

const round2 = (v: number): number => Number(v.toFixed(2));

/** 计算本企业连续工龄（年），按月粗略计算 */
export function calcSeniorityYears(entryDate: string, period: string): number {
  if (!entryDate) return 0;
  const entry = new Date(entryDate);
  const settle = new Date(period + '-01');
  if (isNaN(entry.getTime()) || isNaN(settle.getTime())) return 0;
  const years = (settle.getTime() - entry.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, years);
}

/** 计算连续病假时长（天数） */
export function calcContinuousSickDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1);
}

/**
 * 病假支付系数（按本企业连续工龄分档）
 *
 * 两档规则：
 * 1. 连续病假 ≤ 6 个月 → 疾病休假工资：
 *    不满2年60% / 满2年不满4年70% / 满4年不满6年80% / 满6年不满8年90% / 满8年及以上100%
 * 2. 连续病假 > 6 个月 → 疾病救济费：
 *    不满1年40% / 满1年不满3年50% / 满3年及以上60%
 */
export function calcSickPayRate(entryDate: string, period: string, isContinuous: boolean, continuousDays: number): number {
  const years = calcSeniorityYears(entryDate, period);
  const overSixMonths = continuousDays > 180; // 约6个月

  // 连续病假超过 6 个月 → 疾病救济费（待遇下降一档）
  if (isContinuous && overSixMonths) {
    if (years < 1) return 0.40;
    if (years < 3) return 0.50;
    return 0.60;
  }

  // 其余情况（含非连续病假）→ 疾病休假工资，统一按工龄分档
  if (years < 2) return 0.60;
  if (years < 4) return 0.70;
  if (years < 6) return 0.80;
  if (years < 8) return 0.90;
  return 1.00;
}

export interface AttendanceInput {
  entry_date?: string;
  period: string;
  basic_salary?: number;
  pay_days?: number;            // 21.75 / 26 / 30
  // 病假
  sick_days?: number;
  is_continuous_sick?: boolean;
  continuous_sick_start?: string;
  continuous_sick_end?: string;
  // 事假
  personal_days?: number;
  // 旷工
  absenteeism_days?: number;
  // 加班
  overtime_type?: string;       // 平时加班/周末加班/法定节假日加班
  overtime_unit?: string;       // 天/小时
  overtime_qty?: number;
  hourly_rate?: number;
  holiday_fixed_amount?: number;
  position?: string;            // 用于判断保洁
  // 入离职
  actual_attendance_days?: number;
  leave_date?: string;
  // 特殊调整
  special_adjust_amount?: number;
}

export interface AttendanceResult {
  seniority_years: number;
  daily_wage: number;
  sick_pay_rate: number;
  sick_deduct_rate: number;
  sick_amount: number;
  personal_amount: number;
  absenteeism_amount: number;
  overtime_amount: number;
  on_off_adjust: number;
  special_adjust_amount: number;
  attendance_adjust_total: number;
}

/** 判断是否保洁（职位精确等于"保洁"） */
function isCleaner(position?: string): boolean {
  return position?.trim() === '保洁';
}

/** 主计算函数 */
export function calcAttendance(input: AttendanceInput): AttendanceResult {
  const basic = Number(input.basic_salary || 0);
  const payDays = Number(input.pay_days || 21.75);
  const dailyWage = payDays > 0 ? round2(basic / payDays) : 0;
  const seniorityYears = calcSeniorityYears(input.entry_date || '', input.period);

  // 病假
  const sickDays = Number(input.sick_days || 0);
  const continuousDays = input.is_continuous_sick
    ? calcContinuousSickDays(input.continuous_sick_start || '', input.continuous_sick_end || '')
    : 0;
  const sickPayRate = calcSickPayRate(
    input.entry_date || '', input.period, !!input.is_continuous_sick, continuousDays
  );
  const sickDeductRate = round2(1 - sickPayRate);
  const sickAmount = round2(dailyWage * sickDays * sickDeductRate);

  // 事假（日薪×天数，扣款为负）
  const personalDays = Number(input.personal_days || 0);
  const personalAmount = round2(dailyWage * personalDays);

  // 旷工（日薪×天数×100%，扣款为负）
  const absenteeismDays = Number(input.absenteeism_days || 0);
  const absenteeismAmount = round2(dailyWage * absenteeismDays * 1.0);

  // 加班
  const overtimeType = input.overtime_type || '';
  const overtimeUnit = input.overtime_unit || '天';
  const overtimeQty = Number(input.overtime_qty || 0);
  let overtimeAmount = 0;

  if (overtimeQty > 0) {
    if (overtimeUnit === '小时') {
      // 按小时：小时数 × 时薪
      const hourlyRate = Number(input.hourly_rate || 0);
      overtimeAmount = round2(overtimeQty * hourlyRate);
    } else {
      // 按天
      if (overtimeType === '法定节假日加班' && isCleaner(input.position)) {
        // 保洁法定节假日：天数 × 固定金额
        const fixed = Number(input.holiday_fixed_amount || 0);
        overtimeAmount = round2(overtimeQty * fixed);
      } else {
        const rate = overtimeType === '周末加班' ? 2 : overtimeType === '法定节假日加班' ? 3 : 1;
        overtimeAmount = round2(overtimeQty * dailyWage * rate);
      }
    }
  }

  // 入离职调整（月中入职/离职：折算工资 - 整月工资，通常为负）
  let onOffAdjust = 0;
  const actualDays = Number(input.actual_attendance_days || 0);
  const hasOnOff = actualDays > 0 && actualDays < payDays;
  if (hasOnOff) {
    const prorated = round2(dailyWage * actualDays);
    onOffAdjust = round2(prorated - basic);
  }

  // 特殊调整
  const specialAdjust = Number(input.special_adjust_amount || 0);

  // 扣款字段存负数，增发字段存正数，合计 = 直接相加
  const sickAmountSigned = -sickAmount;
  const personalAmountSigned = -personalAmount;
  const absenteeismAmountSigned = -absenteeismAmount;
  const attendanceAdjustTotal = round2(
    sickAmountSigned + personalAmountSigned + absenteeismAmountSigned + overtimeAmount + onOffAdjust + specialAdjust
  );

  return {
    seniority_years: round2(seniorityYears),
    daily_wage: dailyWage,
    sick_pay_rate: sickPayRate,
    sick_deduct_rate: sickDeductRate,
    sick_amount: sickAmountSigned,
    personal_amount: personalAmountSigned,
    absenteeism_amount: absenteeismAmountSigned,
    overtime_amount: overtimeAmount,
    on_off_adjust: onOffAdjust,
    special_adjust_amount: specialAdjust,
    attendance_adjust_total: attendanceAdjustTotal,
  };
}
