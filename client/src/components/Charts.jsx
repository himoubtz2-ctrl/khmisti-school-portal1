import { useId, useMemo, useRef, useState } from 'react';

const PALETTE = ['#0B3C49', '#8C3A2E', '#E0A33C', '#4A6B52', '#436B78', '#B06A3C'];

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function niceMax(value) {
  const n = finite(value);
  if (n <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(n));
  const scaled = n / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(finite(value));
}

function ChartEmpty({ x, y, label }) {
  if (!label) return null;
  return <text x={x} y={y} textAnchor="middle" className="chart-empty-label">{label}</text>;
}

export function AreaChart({
  data = [],
  xKey = 'day',
  yKey = 'value',
  label = '',
  emptyLabel = '',
  rtl = false,
  color = '#0B3C49',
}) {
  const svgRef = useRef(null);
  const [active, setActive] = useState(null);
  const gradientId = `area-${useId().replace(/:/g, '')}`;
  const width = 760;
  const height = 280;
  const pad = { top: 24, right: 24, bottom: 42, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => finite(d[yKey])))), [data, yKey]);
  const points = data.map((d, i) => {
    const t = data.length <= 1 ? 0 : i / (data.length - 1);
    const x = pad.left + (rtl ? 1 - t : t) * plotW;
    const y = pad.top + (1 - finite(d[yKey]) / max) * plotH;
    return { x, y, item: d };
  });
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const baseline = pad.top + plotH;
  const area = points.length ? `${line} L${points[points.length - 1].x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z` : '';
  const yTicks = [0, max / 2, max];
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter((i) => i >= 0);

  const pointer = (event) => {
    if (!data.length || !svgRef.current) return;
    const box = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * width;
    let ratio = (svgX - pad.left) / plotW;
    if (rtl) ratio = 1 - ratio;
    const index = Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))));
    setActive(index);
  };

  const activePoint = active == null ? null : points[active];
  const activeValue = activePoint ? finite(activePoint.item[yKey]) : 0;
  const tipX = activePoint ? Math.min(width - 160, Math.max(8, activePoint.x + (activePoint.x > width * 0.68 ? -158 : 10))) : 0;
  const tipY = activePoint ? Math.max(8, Math.min(height - 64, activePoint.y - 54)) : 0;

  return (
    <svg
      ref={svgRef}
      className="chart chart--area"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      onPointerMove={pointer}
      onPointerLeave={() => setActive(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => {
        const y = pad.top + (1 - tick / max) * plotH;
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="chart-grid" />
            <text x={pad.left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">{compactNumber(tick)}</text>
          </g>
        );
      })}
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {labelIndexes.map((index) => {
        const point = points[index];
        if (!point) return null;
        return <text key={index} x={point.x} y={height - 13} textAnchor="middle" className="chart-axis-label">{String(point.item[xKey] ?? '').slice(-5)}</text>;
      })}
      {data.every((d) => finite(d[yKey]) === 0) && <ChartEmpty x={width / 2} y={height / 2} label={emptyLabel} />}
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={active === index ? 6 : 3.5}
          fill="var(--stone)"
          stroke={color}
          strokeWidth="3"
          tabIndex="0"
          onFocus={() => setActive(index)}
          onBlur={() => setActive(null)}
        >
          <title>{`${point.item[xKey]}: ${finite(point.item[yKey])}`}</title>
        </circle>
      ))}
      {activePoint && (
        <g pointerEvents="none">
          <rect x={tipX} y={tipY} width="150" height="48" rx="9" className="chart-tooltip" />
          <text x={tipX + 10} y={tipY + 18} className="chart-tooltip-label">{String(activePoint.item[xKey])}</text>
          <text x={tipX + 10} y={tipY + 37} className="chart-tooltip-value">{compactNumber(activeValue)}</text>
        </g>
      )}
    </svg>
  );
}

export function BarChart({ data = [], label = '', emptyLabel = '', rtl = false, formatValue = compactNumber }) {
  const [active, setActive] = useState(null);
  const width = 760;
  const height = 290;
  const pad = { top: 24, right: 24, bottom: 62, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => finite(d.value)))), [data]);
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(64, slot * 0.62);
  const ticks = [0, max / 2, max];

  return (
    <svg className="chart chart--bar" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {ticks.map((tick) => {
        const y = pad.top + (1 - tick / max) * plotH;
        return (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="chart-grid" />
            <text x={pad.left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">{formatValue(tick)}</text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const t = data.length <= 1 ? 0 : index / Math.max(1, data.length - 1);
        const center = pad.left + (rtl ? 1 - t : t) * plotW;
        const h = (finite(item.value) / max) * plotH;
        const y = pad.top + plotH - h;
        return (
          <g
            key={item.label || index}
            tabIndex="0"
            role="graphics-symbol"
            aria-label={`${item.label}: ${finite(item.value)}`}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <rect x={center - slot / 2} y={pad.top} width={slot} height={plotH} fill="transparent" />
            <rect x={center - barW / 2} y={y} width={barW} height={h} rx="7" fill={PALETTE[index % PALETTE.length]} opacity={active == null || active === index ? 0.92 : 0.38} />
            <text x={center} y={height - 35} textAnchor="end" transform={`rotate(-35 ${center} ${height - 35})`} className="chart-axis-label chart-axis-label--bar">{item.label}</text>
            <text x={center} y={Math.max(14, y - 8)} textAnchor="middle" className="chart-bar-value">{formatValue(item.value)}</text>
          </g>
        );
      })}
      {data.every((d) => finite(d.value) === 0) && <ChartEmpty x={width / 2} y={height / 2} label={emptyLabel} />}
    </svg>
  );
}

export function DonutChart({ data = [], centerLabel = '', emptyLabel = '', formatValue = compactNumber }) {
  const [active, setActive] = useState(null);
  const size = 260;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + finite(item.value), 0);
  let offset = 0;
  const segments = data.map((item, index) => {
    const length = total ? (finite(item.value) / total) * circumference : 0;
    const segment = { ...item, index, length, offset };
    offset += length;
    return segment;
  });
  const selected = active == null ? null : segments[active];

  return (
    <div className="donut-wrap">
      <svg className="chart chart--donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
        <circle cx={size / 2} cy={size / 2} r={radius} className="donut-track" />
        {total > 0 && segments.map((segment) => (
          <circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={PALETTE[segment.index % PALETTE.length]}
            strokeWidth={active === segment.index ? 29 : 23}
            strokeDasharray={`${Math.max(0, segment.length - 3)} ${circumference}`}
            strokeDashoffset={-segment.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            opacity={active == null || active === segment.index ? 1 : 0.35}
            tabIndex="0"
            role="button"
            aria-label={`${segment.label}: ${finite(segment.value)}`}
            onMouseEnter={() => setActive(segment.index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(segment.index)}
            onBlur={() => setActive(null)}
          />
        ))}
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="donut-total">{formatValue(selected ? selected.value : total)}</text>
        <text x={size / 2} y={size / 2 + 20} textAnchor="middle" className="donut-caption">{selected ? selected.label : centerLabel}</text>
        {total === 0 && <ChartEmpty x={size / 2} y={size / 2 + 48} label={emptyLabel} />}
      </svg>
      <div className="donut-legend">
        {data.map((item, index) => (
          <button
            type="button"
            key={item.label}
            className={active === index ? 'is-active' : ''}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <i style={{ background: PALETTE[index % PALETTE.length] }} />
            <span>{item.label}</span>
            <b>{formatValue(item.value)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data = [], label = '', color = '#8C3A2E' }) {
  const width = 170;
  const height = 48;
  const values = data.map((d) => finite(d.value ?? d));
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width,
    y: height - 3 - (value / max) * (height - 8),
    value,
  }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={color} />}
    </svg>
  );
}
