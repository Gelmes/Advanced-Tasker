// Tiny scale + path helpers for the SVG charts.

export type Scale = (v: number) => number;

export function linear(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): Scale {
  const d = domainMax - domainMin || 1;
  return (v) => rangeMin + ((v - domainMin) / d) * (rangeMax - rangeMin);
}

export interface Pt {
  x: number;
  y: number;
}

export function linePath(points: Pt[]): string {
  if (!points.length) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

export function areaPath(points: Pt[], baselineY: number): string {
  if (!points.length) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return (
    `M ${first.x.toFixed(1)} ${baselineY.toFixed(1)} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} Z`
  );
}

/** ~`count` "nice" tick values from 0..max (rounded to 1/2/5 × 10^n steps). */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}
