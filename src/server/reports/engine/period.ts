/**
 * Period resolution for reports — pure. Presets are resolved against the caller's `now`
 * expressed as a calendar date in the given IANA time zone (default IST). Outputs are
 * date-only ISO dates: `from` inclusive, `to` exclusive (blueprint §7 date conventions).
 *
 * No date library is installed, so local calendar parts come from `Intl.DateTimeFormat`.
 */
import type { IsoDate, IsoTimestamp, ReportFilters } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";

export const DEFAULT_REPORT_TIME_ZONE = "Asia/Kolkata";

export interface ResolvedRange {
  from: IsoDate;
  to: IsoDate;
}

interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  /** ISO weekday: Monday = 1 … Sunday = 7. */
  isoWeekday: number;
}

const WEEKDAY_TO_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Calendar date of `instant` as observed in `timeZone`. */
export function civilDateIn(instant: Date, timeZone: string = DEFAULT_REPORT_TIME_ZONE): CivilDate {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    isoWeekday: WEEKDAY_TO_ISO[get("weekday")] ?? 1,
  };
}

/** Civil (year, month, day) → "YYYY-MM-DD", with day overflow normalised via Date.UTC. */
function toIsoDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Date-only ISO date (IST calendar) for a UTC timestamp; used to bucket records into ranges. */
export function localDateOf(timestamp: IsoTimestamp, timeZone: string = DEFAULT_REPORT_TIME_ZONE): IsoDate {
  const c = civilDateIn(new Date(timestamp), timeZone);
  return toIsoDate(c.year, c.month, c.day);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string | undefined): value is IsoDate {
  if (!value || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Resolve a preset (or CUSTOM range) to `[from, to)` calendar dates.
 *  - TODAY: today..tomorrow
 *  - THIS_WEEK: Monday..next Monday
 *  - THIS_MONTH: 1st..1st of next month
 *  - THIS_QUARTER: quarter start..next quarter start
 *  - CUSTOM: requires `from` and `to` with from < to → INVALID_INPUT otherwise.
 */
export function resolvePeriod(
  filters: Pick<ReportFilters, "period" | "from" | "to">,
  now: Date,
  timeZone: string = DEFAULT_REPORT_TIME_ZONE,
): ResolvedRange {
  const today = civilDateIn(now, timeZone);
  switch (filters.period) {
    case "TODAY":
      return {
        from: toIsoDate(today.year, today.month, today.day),
        to: toIsoDate(today.year, today.month, today.day + 1),
      };
    case "THIS_WEEK": {
      const mondayOffset = today.isoWeekday - 1;
      return {
        from: toIsoDate(today.year, today.month, today.day - mondayOffset),
        to: toIsoDate(today.year, today.month, today.day - mondayOffset + 7),
      };
    }
    case "THIS_MONTH":
      return {
        from: toIsoDate(today.year, today.month, 1),
        to: toIsoDate(today.year, today.month + 1, 1),
      };
    case "THIS_QUARTER": {
      const quarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
      return {
        from: toIsoDate(today.year, quarterStartMonth, 1),
        to: toIsoDate(today.year, quarterStartMonth + 3, 1),
      };
    }
    case "CUSTOM": {
      if (!isValidIsoDate(filters.from) || !isValidIsoDate(filters.to)) {
        throw new ApiFailure("INVALID_INPUT", "CUSTOM period requires valid 'from' and 'to' dates (YYYY-MM-DD)", {
          from: filters.from,
          to: filters.to,
        });
      }
      if (filters.from >= filters.to) {
        throw new ApiFailure("INVALID_INPUT", "'from' must be earlier than 'to' (to is exclusive)", {
          from: filters.from,
          to: filters.to,
        });
      }
      return { from: filters.from, to: filters.to };
    }
    default: {
      const never: never = filters.period;
      throw new ApiFailure("INVALID_INPUT", `Unknown period preset '${String(never)}'`);
    }
  }
}
