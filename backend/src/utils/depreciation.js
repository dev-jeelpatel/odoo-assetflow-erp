const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Straight-line book value: depreciates acquisition_cost to 0 over
 * useful_life_years. Assets missing acquisition_date or useful_life_years
 * are treated as non-depreciating (book value = acquisition_cost as-is). */
export function computeBookValue({ acquisition_cost, acquisition_date, useful_life_years }, asOf = new Date()) {
  if (!acquisition_cost) return 0;
  const cost = Number(acquisition_cost);
  if (!acquisition_date || !useful_life_years) return cost;
  const ageYears = (asOf - new Date(acquisition_date)) / MS_PER_YEAR;
  const fraction = Math.min(Math.max(ageYears, 0) / useful_life_years, 1);
  return Math.max(cost * (1 - fraction), 0);
}
