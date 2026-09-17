const arabicNumber = new Intl.NumberFormat("ar", { useGrouping: true });
const arabicPlural = new Intl.PluralRules("ar");

export function formatStudentCount(count: number) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  const number = arabicNumber.format(safeCount);

  switch (arabicPlural.select(safeCount)) {
    case "one":
      return "طالب واحد";
    case "two":
      return "طالبان";
    case "few":
      return `${number} طلاب`;
    case "many":
      return `${number} طالبًا`;
    default:
      return `${number} طالب`;
  }
}