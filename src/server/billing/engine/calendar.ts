import type { BillingInterval, CalendarPeriod, IsoDate } from "@/contracts/ruchir";

const DAY_MS = 86_400_000;

const MONTHS: Record<BillingInterval, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

export function parseDate(iso: IsoDate): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not a date-only ISO string: '${iso}'`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Not a real calendar date: '${iso}'`);
  }
  return { year, month, day };
}

export function formatDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtcMs(iso: IsoDate): number {
  const { year, month, day } = parseDate(iso);
  return Date.UTC(year, month - 1, day);
}

/** Calendar days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function todayUtc(now: Date = new Date()): IsoDate {
  return now.toISOString().slice(0, 10);
}

/**
 * Adds whole months keeping the original anchor day, clamped to the last valid day of the
 * target month. Jan 31 + 1 month is Feb 28 (29 in leap years); the anchor stays 31 so the
 * following period lands on Mar 31, not Mar 28.
 */
export function addMonthsAnchored(input: { date: IsoDate; months: number; anchorDay: number }): IsoDate {
  const { year, month } = parseDate(input.date);
  const total = year * 12 + (month - 1) + input.months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return formatDate(targetYear, targetMonth, Math.min(input.anchorDay, daysInMonth(targetYear, targetMonth)));
}

export function addInterval(input: { date: IsoDate; interval: BillingInterval; anchorDay: number }): IsoDate {
  return addMonthsAnchored({ date: input.date, months: MONTHS[input.interval], anchorDay: input.anchorDay });
}

/** Half-open period [start, end) starting at `start`. */
export function periodFrom(input: { start: IsoDate; interval: BillingInterval; anchorDay: number }): CalendarPeriod {
  const end = addInterval({ date: input.start, interval: input.interval, anchorDay: input.anchorDay });
  return { start: input.start, end, days: daysBetween(input.start, end) };
}

export function anchorDayOf(date: IsoDate): number {
  return parseDate(date).day;
}
