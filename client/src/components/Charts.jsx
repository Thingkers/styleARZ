/** Lightweight SVG charts — no chart library dependency. */

function formatCompact(value) {
  const n = Number(value) || 0;
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function RevenueBarChart({ series = [], height = 180 }) {
  const width = 560;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.map((row) => Number(row.total) || 0));
  const gap = 0.28;
  const slot = series.length ? innerW / series.length : innerW;
  const barW = Math.max(4, slot * (1 - gap));

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue by day">
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = pad.top + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text className="chart-axis" x={pad.left - 6} y={y + 3} textAnchor="end">
                {formatCompact(max * frac)}
              </text>
            </g>
          );
        })}
        {series.map((row, index) => {
          const total = Number(row.total) || 0;
          const online = Number(row.online) || 0;
          const pos = Number(row.pos) || 0;
          const x = pad.left + index * slot + (slot - barW) / 2;
          const hOnline = (online / max) * innerH;
          const hPos = (pos / max) * innerH;
          const yPos = pad.top + innerH - hPos;
          const yOnline = yPos - hOnline;
          const label = String(row.date || "").slice(5);
          return (
            <g key={row.date || index}>
              {hPos > 0 ? (
                <rect className="chart-bar chart-bar-pos" x={x} y={yPos} width={barW} height={hPos} rx="1.5" />
              ) : null}
              {hOnline > 0 ? (
                <rect className="chart-bar chart-bar-online" x={x} y={yOnline} width={barW} height={hOnline} rx="1.5" />
              ) : null}
              {total === 0 ? (
                <rect className="chart-bar chart-bar-empty" x={x} y={pad.top + innerH - 2} width={barW} height={2} rx="1" />
              ) : null}
              {(index === 0 || index === series.length - 1 || index % 3 === 0) && (
                <text className="chart-axis" x={x + barW / 2} y={height - 8} textAnchor="middle">
                  {label}
                </text>
              )}
              <title>{`${row.date}: online ${formatCompact(online)}, POS ${formatCompact(pos)}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span className="is-online">Online</span>
        <span className="is-pos">POS</span>
      </div>
    </div>
  );
}

export function StatusDonutChart({ segments = [], size = 168 }) {
  const total = segments.reduce((sum, row) => sum + (Number(row.value) || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const stroke = size * 0.14;
  let angle = -Math.PI / 2;

  const arcs = segments.map((row) => {
    const value = Number(row.value) || 0;
    const sweep = (value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const end = angle;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const path =
      value <= 0
        ? ""
        : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    return { ...row, path, value };
  });

  return (
    <div className="chart-donut-layout">
      <svg className="chart-svg chart-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Orders by status">
        <circle className="chart-donut-track" cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke} />
        {arcs.map((arc) =>
          arc.path ? (
            <path
              key={arc.key || arc.label}
              className={`chart-donut-arc is-${arc.key || "default"}`}
              d={arc.path}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="butt"
            >
              <title>{`${arc.label}: ${arc.value}`}</title>
            </path>
          ) : null
        )}
        <text className="chart-donut-center" x={cx} y={cy - 4} textAnchor="middle">
          {segments.reduce((sum, row) => sum + (Number(row.value) || 0), 0)}
        </text>
        <text className="chart-donut-sub" x={cx} y={cy + 14} textAnchor="middle">
          orders
        </text>
      </svg>
      <ul className="chart-donut-legend">
        {segments.map((row) => (
          <li key={row.key || row.label}>
            <i className={`is-${row.key || "default"}`} aria-hidden="true" />
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
