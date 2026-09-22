import { arabicDigits } from "@/lib/quran-surahs";
import { pagesForText, pagesLabel } from "@/lib/quran-pages";

export const WEEK_COLUMNS = [2, 3, 4, 5, 6] as const;
export const ATTENDANCE_COLUMN = 7;
export const TOTAL_COLUMN = 8;
export const NOTES_COLUMN = 9;
export const TABLE_COLUMN_COUNT = 10;

export type AttendanceStats = {
  attended: number;
  expected: number;
  complete: boolean;
  label: string;
};

export function calculateAttendance(row: readonly string[]): AttendanceStats {
  const weeks = WEEK_COLUMNS.map((column) => String(row[column] ?? "").trim());
  const monthEndIndex = weeks.findIndex((value) => value.includes("شهر"));
  const expected = monthEndIndex >= 0 ? monthEndIndex + 1 : weeks.length;
  const attended = weeks.slice(0, expected).filter(Boolean).length;
  return {
    attended,
    expected,
    complete: expected > 0 && attended === expected,
    label: `${arabicDigits(attended)}/${arabicDigits(expected)}`,
  };
}

/** مجموع الصفحات المحفوظة من كل خانات التسميع. */
export function calculateTotalPages(row: readonly string[]) {
  return WEEK_COLUMNS.reduce((sum, column) => sum + pagesForText(String(row[column] ?? "")), 0);
}

export function totalLabel(row: readonly string[]) {
  return pagesLabel(calculateTotalPages(row));
}

export function withCalculatedAttendance(row: readonly string[]) {
  const normalized = Array.from({ length: TABLE_COLUMN_COUNT }, (_, index) => String(row[index] ?? ""));
  normalized[ATTENDANCE_COLUMN] = calculateAttendance(normalized).label;
  normalized[TOTAL_COLUMN] = totalLabel(normalized);
  return normalized;
}
