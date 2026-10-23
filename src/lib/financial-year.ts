export function financialYearFor(date: Date, startMonth = 4) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month >= startMonth ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

export function financialYearShort(date: Date, startMonth = 4) {
  const fy = financialYearFor(date, startMonth);
  const [start, end] = fy.split("-");
  return `${String(start).slice(-2)}-${end}`;
}
