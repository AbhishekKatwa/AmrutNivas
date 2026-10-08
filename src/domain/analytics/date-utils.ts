/**
 * Analytics date range utilities.
 *
 * Supports standard periods (TODAY, THIS_WEEK, THIS_MONTH, etc.) and custom ranges.
 * Respects organization/property business date and timezone.
 */

import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears, differenceInDays, format } from "date-fns";

export type AnalyticsPeriod =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";

export type ComparisonMode = "PREVIOUS_PERIOD" | "SAME_PERIOD_LAST_YEAR" | "NONE";

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface AnalyticsDateRange {
  current: DateRange;
  previous?: DateRange;
  yearAgo?: DateRange;
}

/**
 * Resolve a period to a date range.
 */
export function resolveDateRange(
  period: AnalyticsPeriod,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date(),
): DateRange {
  switch (period) {
    case "TODAY":
      return {
        start: startOfDay(referenceDate),
        end: endOfDay(referenceDate),
        label: "Today",
      };
    case "YESTERDAY":
      return {
        start: startOfDay(subDays(referenceDate, 1)),
        end: endOfDay(subDays(referenceDate, 1)),
        label: "Yesterday",
      };
    case "THIS_WEEK":
      return {
        start: startOfWeek(referenceDate, { weekStartsOn: 1 }),
        end: endOfWeek(referenceDate, { weekStartsOn: 1 }),
        label: "This Week",
      };
    case "LAST_WEEK":
      return {
        start: startOfWeek(subWeeks(referenceDate, 1), { weekStartsOn: 1 }),
        end: endOfWeek(subWeeks(referenceDate, 1), { weekStartsOn: 1 }),
        label: "Last Week",
      };
    case "THIS_MONTH":
      return {
        start: startOfMonth(referenceDate),
        end: endOfMonth(referenceDate),
        label: "This Month",
      };
    case "LAST_MONTH":
      return {
        start: startOfMonth(subMonths(referenceDate, 1)),
        end: endOfMonth(subMonths(referenceDate, 1)),
        label: "Last Month",
      };
    case "THIS_QUARTER":
      return {
        start: startOfQuarter(referenceDate),
        end: endOfQuarter(referenceDate),
        label: "This Quarter",
      };
    case "LAST_QUARTER":
      return {
        start: startOfQuarter(subMonths(referenceDate, 3)),
        end: endOfQuarter(subMonths(referenceDate, 3)),
        label: "Last Quarter",
      };
    case "THIS_YEAR":
      return {
        start: startOfYear(referenceDate),
        end: endOfYear(referenceDate),
        label: "This Year",
      };
    case "LAST_YEAR":
      return {
        start: startOfYear(subYears(referenceDate, 1)),
        end: endOfYear(subYears(referenceDate, 1)),
        label: "Last Year",
      };
    case "CUSTOM":
      if (!customStart || !customEnd) {
        throw new Error("Custom period requires start and end dates");
      }
      return {
        start: startOfDay(new Date(customStart)),
        end: endOfDay(new Date(customEnd)),
        label: `${format(new Date(customStart), "MMM d")} - ${format(new Date(customEnd), "MMM d, yyyy")}`,
      };
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

/**
 * Resolve comparison ranges for a given period.
 */
export function resolveComparisonRanges(
  period: AnalyticsPeriod,
  comparison: ComparisonMode,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date(),
): AnalyticsDateRange {
  const current = resolveDateRange(period, customStart, customEnd, referenceDate);

  if (comparison === "NONE") {
    return { current };
  }

  if (comparison === "PREVIOUS_PERIOD") {
    const days = differenceInDays(current.end, current.start) + 1;
    const previous = {
      start: subDays(current.start, days),
      end: subDays(current.start, 1),
      label: "Previous Period",
    };
    return { current, previous };
  }

  if (comparison === "SAME_PERIOD_LAST_YEAR") {
    const yearAgo = {
      start: subYears(current.start, 1),
      end: subYears(current.end, 1),
      label: "Same Period Last Year",
    };
    return { current, yearAgo };
  }

  return { current };
}

/**
 * Format a date range for display.
 */
export function formatDateRange(range: DateRange): string {
  const startStr = format(range.start, "MMM d");
  const endStr = format(range.end, "MMM d, yyyy");
  return `${startStr} - ${endStr}`;
}

/**
 * Check if a date is within a range.
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * Get ISO date string for a date range.
 */
export function toDateStrings(range: DateRange): { start: string; end: string } {
  return {
    start: format(range.start, "yyyy-MM-dd"),
    end: format(range.end, "yyyy-MM-dd"),
  };
}
