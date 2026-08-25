import { useId } from 'react';
import {
  type Box,
  type SeriesValue,
  type TrendResolution,
  buildSegments,
  buildStackSegments,
  formatAxisTime,
  niceMax,
  pickTickIndexes,
} from '../trendSeries';

const BOX: Box = { width: 1000, height: 150 };
const GRID_LINES = 4;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: SeriesValue[];
  /** 누적 영역으로 그린다. 합이 곧 전체인 계열(상담원 상태)에만 쓴다. */
  stacked?: boolean;
}

interface TrendChartProps {
  series: ChartSeries[];
  timestamps: string[];
  resolution: TrendResolution;
  /** 값 대신 이 라벨로 y축을 읽는다 (예: '초'). */
  unit?: string;
  /** 이 구간은 회색으로 덮는다. AMI 가 끊겨 리소스를 못 잰 구간. */
  outageIndexes?: number[];
  hoverIndex: number | null;
  onHoverIndex: (index: number | null) => void;
}

function linePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 1) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

function areaPath(points: Array<{ x: number; y0: number; y1: number }>): string {
  const top = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y1}`).join(' ');
  const bottom = [...points].reverse().map((point) => `L${point.x} ${point.y0}`).join(' ');
  return `${top} ${bottom} Z`;
}

/**
 * 선/누적 영역 차트.
 *
 * 차트 라이브러리를 쓰지 않는다 — 관리자 앱에 차트 의존성이 없고 필요한 것이
 * 이 두 가지뿐이다. 색은 전부 CSS 변수라 다크/라이트가 같이 따라간다.
 *
 * <b>안 잰 구간은 선을 끊는다.</b> 이어 그리면 그 시각에 값이 그랬다고 읽히는데,
 * 실제로는 재지 않은 것이다.
 */
export function TrendChart({
  series,
  timestamps,
  resolution,
  unit,
  outageIndexes = [],
  hoverIndex,
  onHoverIndex,
}: TrendChartProps) {
  const clipId = useId();
  const count = timestamps.length;
  const stacked = series.filter((item) => item.stacked);
  const lines = series.filter((item) => !item.stacked);

  const lineMax = niceMax(
    Math.max(
      0,
      ...lines.flatMap((item) => item.values.map((value) => value.value ?? 0)),
    ),
  );
  const stackedMax = niceMax(
    Math.max(
      0,
      ...Array.from({ length: count }, (_, index) =>
        stacked.reduce((sum, item) => sum + (item.values[index]?.value ?? 0), 0)),
    ),
  );
  const axisMax = stacked.length ? stackedMax : lineMax;

  const stackedAreas = stacked.length ? buildStackSegments(stacked, BOX) : [];
  const xAt = (index: number) => (count <= 1 ? 0 : (index / (count - 1)) * BOX.width);

  return (
    <div className="trend-chart">
      <div className="trend-chart-legend">
        {series.map((item) => (
          <span key={item.key} className="trend-chart-legend-item">
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        className="trend-chart-svg"
        onMouseLeave={() => onHoverIndex(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || count === 0) return;
          const ratio = (event.clientX - rect.left) / rect.width;
          onHoverIndex(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={BOX.width} height={BOX.height} />
          </clipPath>
        </defs>

        {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
          const y = (index / GRID_LINES) * BOX.height;
          return <line key={index} x1="0" y1={y} x2={BOX.width} y2={y} className="trend-chart-grid" />;
        })}

        {/* AMI 가 끊겨 리소스를 못 잰 구간. 빈 것과 못 잰 것을 눈으로 구분시킨다. */}
        <g clipPath={`url(#${clipId})`}>
          {outageIndexes.map((index) => (
            <rect
              key={index}
              x={xAt(index) - (count > 1 ? BOX.width / (count - 1) / 2 : 0)}
              y="0"
              width={count > 1 ? BOX.width / (count - 1) : BOX.width}
              height={BOX.height}
              className="trend-chart-outage"
            />
          ))}
        </g>

        <g clipPath={`url(#${clipId})`}>
          {stackedAreas.map((stack) => {
            const meta = stacked.find((item) => item.key === stack.key)!;
            return stack.areas.map((area, areaIndex) => (
              <path
                key={`${stack.key}-${areaIndex}`}
                d={areaPath(area.points)}
                fill={meta.color}
                fillOpacity={0.55}
              />
            ));
          })}

          {lines.map((item) =>
            buildSegments(item.values, lineMax, BOX).map((segment, segmentIndex) => (
              <g key={`${item.key}-${segmentIndex}`}>
                <path d={linePath(segment.points)} fill="none" stroke={item.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {/* 이웃이 없어 선이 안 그려지는 외톨이 값은 점으로 남긴다. */}
                {segment.points.length === 1 && (
                  <circle cx={segment.points[0].x} cy={segment.points[0].y} r={3} fill={item.color} />
                )}
              </g>
            )),
          )}
        </g>

        {hoverIndex !== null && (
          <line
            x1={xAt(hoverIndex)}
            y1="0"
            x2={xAt(hoverIndex)}
            y2={BOX.height}
            className="trend-chart-cursor"
          />
        )}
      </svg>

      <div className="trend-chart-axis">
        <span className="trend-chart-axis-max">{axisMax}{unit ?? ''}</span>
        {pickTickIndexes(count, 8).map((index) => (
          <span key={index} className="trend-chart-tick" style={{ left: `${count <= 1 ? 0 : (index / (count - 1)) * 100}%` }}>
            {formatAxisTime(timestamps[index], resolution)}
          </span>
        ))}
      </div>
    </div>
  );
}
