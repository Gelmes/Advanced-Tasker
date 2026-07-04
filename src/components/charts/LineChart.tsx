import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import { areaPath, linear, linePath, niceTicks, type Pt } from './scale';

// A minimal time-series line chart: shared by burnup and burndown. X is time (ms),
// Y is a count (points). Each series is a polyline; one may be filled as an area.

export interface Series {
  color: string;
  points: { x: number; y: number }[]; // x = ms timestamp, y = value
  dashed?: boolean;
  fill?: boolean;
}

interface Props {
  width: number;
  height: number;
  series: Series[];
  xDomain: [number, number];
  yMax: number;
  xTicks: { value: number; label: string }[];
  /**
   * Concrete hex for grid/labels — SVG attributes can't resolve the CSS-variable
   * tokens, so the caller passes colors from the resolved palette (see theme.ts).
   */
  gridColor?: string;
  labelColor?: string;
}

const M = { left: 40, right: 14, top: 14, bottom: 26 };

export function LineChart({
  width,
  height,
  series,
  xDomain,
  yMax,
  xTicks,
  gridColor = '#eef0f2',
  labelColor = '#9ca3af',
}: Props) {
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const sx = linear(xDomain[0], xDomain[1], M.left, M.left + plotW);
  const sy = linear(0, yMax || 1, M.top + plotH, M.top);
  const yTicks = niceTicks(yMax, 5);
  const project = (pts: { x: number; y: number }[]): Pt[] =>
    pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));

  return (
    <Svg width={width} height={height}>
      {/* Y gridlines + labels */}
      {yTicks.map((t) => (
        <G key={`y${t}`}>
          <Line
            x1={M.left}
            y1={sy(t)}
            x2={M.left + plotW}
            y2={sy(t)}
            stroke={gridColor}
            strokeWidth={1}
          />
          <SvgText x={M.left - 6} y={sy(t) + 4} fontSize={10} fill={labelColor} textAnchor="end">
            {String(t)}
          </SvgText>
        </G>
      ))}

      {/* X axis labels */}
      {xTicks.map((t) => (
        <SvgText
          key={`x${t.value}`}
          x={sx(t.value)}
          y={M.top + plotH + 16}
          fontSize={10}
          fill={labelColor}
          textAnchor="middle"
        >
          {t.label}
        </SvgText>
      ))}

      {/* Series */}
      {series.map((s, i) => {
        const pts = project(s.points);
        return (
          <G key={i}>
            {s.fill && (
              <Path d={areaPath(pts, M.top + plotH)} fill={s.color} fillOpacity={0.12} />
            )}
            <Path
              d={linePath(pts)}
              stroke={s.color}
              strokeWidth={2}
              fill="none"
              strokeDasharray={s.dashed ? '5,4' : undefined}
            />
          </G>
        );
      })}
    </Svg>
  );
}
