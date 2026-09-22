const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const startOfDay = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const startOfMonth = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date, amount) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

export const startOfWeekMonday = (date = new Date()) => {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
};

export const endOfWeekMondayExclusive = (date = new Date()) => {
  const end = startOfWeekMonday(date);
  end.setDate(end.getDate() + 7);
  return end;
};

export const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const monthLabel = (date) => MONTH_LABELS[date.getMonth()];

export const buildMonthRange = (months) => {
  const count = Number(months);
  const size = count === 12 ? 12 : 6;
  const current = startOfMonth();
  const start = addMonths(current, -(size - 1));
  const end = addMonths(current, 1);

  const buckets = [];
  for (let i = 0; i < size; i += 1) {
    const monthDate = addMonths(start, i);
    buckets.push({
      key: monthKey(monthDate),
      year: monthDate.getFullYear(),
      month: monthDate.getMonth() + 1,
      label: monthLabel(monthDate),
      total: 0,
    });
  }

  return { start, end, buckets };
};
