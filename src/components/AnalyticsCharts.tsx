import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartPie, 
  faArrowUp, 
  faArrowDown, 
  faCoins, 
  faUsers, 
  faWarehouse,
  faChartLine,
  faCircle
} from '@fortawesome/free-solid-svg-icons';

// ==========================================
// 1. Math Helpers for SVG Arc Calculations
// ==========================================
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

// ==========================================
// 2. OccupancyDonutChart
// ==========================================
interface OccupancyData {
  available: number;
  rented: number;
  booked: number;
}

export function OccupancyDonutChart({ data }: { data: OccupancyData }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { available = 0, rented = 0, booked = 0 } = data;
  const total = available + rented + booked;
  
  // Safe default if no properties
  const safeAvailable = total === 0 ? 1 : available;
  const safeRented = total === 0 ? 0 : rented;
  const safeBooked = total === 0 ? 0 : booked;
  const safeTotal = safeAvailable + safeRented + safeBooked;

  const segments = [
    { label: 'Available', value: safeAvailable, color: '#10b981', hoverColor: '#34d399', bgLight: 'bg-emerald-50 text-emerald-600' },
    { label: 'Rented', value: safeRented, color: '#3b82f6', hoverColor: '#60a5fa', bgLight: 'bg-blue-50 text-blue-600' },
    { label: 'Booked', value: safeBooked, color: '#f59e0b', hoverColor: '#fbbf24', bgLight: 'bg-amber-50 text-amber-600' },
  ];

  let currentAngle = 0;
  const arcs = segments.map((seg) => {
    const angle = (seg.value / safeTotal) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    return {
      ...seg,
      startAngle,
      endAngle,
      percentage: total > 0 ? Math.round((seg.value / total) * 100) : 0,
    };
  });

  const centerText = hoveredIdx !== null 
    ? `${arcs[hoveredIdx].percentage}%` 
    : `${total}`;
  const centerSubtext = hoveredIdx !== null 
    ? arcs[hoveredIdx].label 
    : 'Units Total';

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-white/60 backdrop-blur-md rounded-3xl border border-zinc-150 shadow-sm w-full">
      <div className="flex flex-col space-y-2">
        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faChartPie} className="text-zinc-400" />
          Occupancy Metrics
        </h3>
        <p className="text-2xl font-black text-zinc-900 tracking-tight">Portfolio Status</p>
        <p className="text-xs text-zinc-500 font-medium">Real-time occupancy and booking status across all managed properties.</p>
        
        <div className="flex flex-col gap-2.5 pt-4">
          {arcs.map((arc, idx) => (
            <div 
              key={arc.label}
              className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 cursor-pointer ${
                hoveredIdx === idx 
                  ? 'border-zinc-300 bg-zinc-50 translate-x-1 shadow-sm' 
                  : 'border-transparent hover:bg-zinc-50/50'
              }`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faCircle} style={{ color: arc.color }} className="h-3 w-3 animate-pulse" />
                <span className="font-bold text-sm text-zinc-700">{arc.label}</span>
              </div>
              <span className={`text-xs font-black px-2.5 py-1 rounded-xl ${arc.bgLight}`}>
                {total > 0 ? arc.value : 0} ({arc.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center justify-center h-48 w-48">
        <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
          {arcs.map((arc, idx) => {
            if (arc.value === 0) return null;
            // Handle edge case of single full circle
            if (arc.endAngle - arc.startAngle === 360) {
              return (
                <circle
                  key={arc.label}
                  cx="100"
                  cy="100"
                  r="70"
                  fill="transparent"
                  stroke={hoveredIdx === idx ? arc.hoverColor : arc.color}
                  strokeWidth={hoveredIdx === idx ? 22 : 18}
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            }
            return (
              <path
                key={arc.label}
                d={describeArc(100, 100, 70, arc.startAngle, arc.endAngle)}
                fill="transparent"
                stroke={hoveredIdx === idx ? arc.hoverColor : arc.color}
                strokeWidth={hoveredIdx === idx ? 22 : 18}
                strokeLinecap="round"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none animate-in fade-in duration-500">
          <span className="text-3xl font-black text-zinc-900 tracking-tighter leading-none">{centerText}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">{centerSubtext}</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. RentCollectionBarChart
// ==========================================
interface RentData {
  collected: number; // in KSh
  pending: number;
  overdue: number;
}

export function RentCollectionBarChart({ data }: { data: RentData }) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const { collected = 0, pending = 0, overdue = 0 } = data;
  const total = collected + pending + overdue;

  const bars = [
    { label: 'Collected', value: collected, color: 'url(#gradient-green)', strokeColor: '#10b981', hoverColor: '#34d399', bgLight: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pending', value: pending, color: 'url(#gradient-blue)', strokeColor: '#3b82f6', hoverColor: '#60a5fa', bgLight: 'bg-blue-50 text-blue-600' },
    { label: 'Overdue', value: overdue, color: 'url(#gradient-red)', strokeColor: '#ef4444', hoverColor: '#f87171', bgLight: 'bg-rose-50 text-rose-600' },
  ];

  const maxVal = Math.max(...bars.map(b => b.value), 1000);
  const chartHeight = 160;
  const chartWidth = 320;

  return (
    <div className="flex flex-col p-6 bg-white/60 backdrop-blur-md rounded-3xl border border-zinc-150 shadow-sm w-full">
      <div className="flex flex-col space-y-2 mb-6">
        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faCoins} className="text-zinc-400" />
          Rent Collection
        </h3>
        <p className="text-2xl font-black text-zinc-900 tracking-tight">KES {collected.toLocaleString()}</p>
        <p className="text-xs text-zinc-500 font-medium">Monthly collection yield with pending allocations.</p>
      </div>

      <div className="relative w-full flex justify-center h-[200px] mb-4">
        <svg viewBox={`0 0 ${chartWidth} 200`} className="w-full h-full">
          <defs>
            <linearGradient id="gradient-green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="gradient-blue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="gradient-red" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = chartHeight - p * chartHeight + 20;
            return (
              <g key={i}>
                <line 
                  x1="30" 
                  y1={y} 
                  x2={chartWidth - 10} 
                  y2={y} 
                  stroke="#e4e4e7" 
                  strokeDasharray="4 4" 
                  strokeWidth="1"
                />
                <text 
                  x="5" 
                  y={y + 4} 
                  fill="#a1a1aa" 
                  fontSize="8" 
                  className="font-black"
                >
                  {Math.round((maxVal * p) / 1000)}k
                </text>
              </g>
            );
          })}

          {/* Render Columns */}
          {bars.map((bar, idx) => {
            const barWidth = 44;
            const gap = 50;
            const x = 50 + idx * (barWidth + gap);
            const height = (bar.value / maxVal) * chartHeight;
            const y = chartHeight - height + 20;
            const isHovered = hoveredBar === bar.label;

            return (
              <g 
                key={bar.label}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredBar(bar.label)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Visual Glow behind bar on hover */}
                {isHovered && (
                  <rect
                    x={x - 4}
                    y={y - 4}
                    width={barWidth + 8}
                    height={height + 8}
                    rx="14"
                    fill={bar.strokeColor}
                    opacity="0.1"
                    className="transition-all duration-300"
                  />
                )}
                {/* Main rounded bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(height, 4)} // Ensure at least a line is drawn
                  rx="10"
                  fill={bar.color}
                  className="transition-all duration-350"
                />
                {/* Labels below bars */}
                <text
                  x={x + barWidth / 2}
                  y="195"
                  fill="#71717a"
                  fontSize="9"
                  textAnchor="middle"
                  className="font-black uppercase tracking-widest"
                >
                  {bar.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover values tooltip display inside component */}
        {hoveredBar && (
          <div className="absolute top-2 right-2 bg-zinc-900 text-white rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest shadow-xl animate-in zoom-in-95 duration-200">
            {hoveredBar}: KES {bars.find(b => b.label === hoveredBar)?.value.toLocaleString()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4">
        {bars.map((bar) => (
          <div key={bar.label} className="text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{bar.label}</p>
            <p className="text-xs font-black text-zinc-800 mt-1">
              {total > 0 ? Math.round((bar.value / total) * 100) : 0}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. UserGrowthLineChart
// ==========================================
interface TimelinePoint {
  label: string;
  value: number;
}

export function UserGrowthLineChart({ data }: { data: TimelinePoint[] }) {
  const [activePt, setActivePt] = useState<number | null>(null);

  const defaultData = [
    { label: 'Dec', value: 45 },
    { label: 'Jan', value: 80 },
    { label: 'Feb', value: 145 },
    { label: 'Mar', value: 210 },
    { label: 'Apr', value: 380 },
    { label: 'May', value: 520 },
  ];

  const points = data && data.length > 0 ? data : defaultData;
  const maxVal = Math.max(...points.map(p => p.value), 100);
  const chartWidth = 520;
  const chartHeight = 150;
  const paddingLeft = 40;
  const paddingRight = 20;
  const ptGap = (chartWidth - paddingLeft - paddingRight) / (points.length - 1);

  // Map coordinates
  const coords = points.map((pt, idx) => {
    const x = paddingLeft + idx * ptGap;
    const y = chartHeight - (pt.value / maxVal) * 120 + 20;
    return { x, y, pt };
  });

  // SVG Spline path generation (smooth curved bezier segments)
  let linePath = '';
  if (coords.length > 0) {
    linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const cpX1 = curr.x + ptGap / 2;
      const cpY1 = curr.y;
      const cpX2 = next.x - ptGap / 2;
      const cpY2 = next.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
    }
  }

  // Smooth Area Path underneath the spline curve
  let areaPath = '';
  if (coords.length > 0) {
    areaPath = linePath + ` L ${coords[coords.length - 1].x} ${chartHeight + 20} L ${coords[0].x} ${chartHeight + 20} Z`;
  }

  return (
    <div className="flex flex-col p-6 bg-white/60 backdrop-blur-md rounded-3xl border border-zinc-150 shadow-sm w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <FontAwesomeIcon icon={faUsers} className="text-zinc-400" />
            Platform Growth
          </h3>
          <p className="text-2xl font-black text-zinc-900 tracking-tight">System Registrations</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider">
          <FontAwesomeIcon icon={faArrowUp} />
          +48.2% MoM
        </div>
      </div>

      <div className="relative w-full h-[180px] mb-4">
        <svg viewBox={`0 0 ${chartWidth} 185`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = chartHeight - p * 120 + 20;
            return (
              <g key={i}>
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={chartWidth - paddingRight} 
                  y2={y} 
                  stroke="#f4f4f5" 
                  strokeWidth="1" 
                />
                <text 
                  x="10" 
                  y={y + 3} 
                  fill="#a1a1aa" 
                  fontSize="8" 
                  className="font-bold"
                >
                  {Math.round(maxVal * p)}
                </text>
              </g>
            );
          })}

          {/* Render Area */}
          {areaPath && (
            <path d={areaPath} fill="url(#area-gradient)" className="animate-in fade-in duration-700" />
          )}

          {/* Render Spline Curve */}
          {linePath && (
            <path 
              d={linePath} 
              fill="none" 
              stroke="#3b82f6" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          )}

          {/* Interactive points mapping */}
          {coords.map((coord, idx) => {
            const isHovered = activePt === idx;
            return (
              <g 
                key={idx}
                onMouseEnter={() => setActivePt(idx)}
                onMouseLeave={() => setActivePt(null)}
                className="cursor-pointer"
              >
                {/* Hover radar halo */}
                {isHovered && (
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r="10"
                    fill="#3b82f6"
                    opacity="0.15"
                    className="animate-ping"
                  />
                )}
                {/* Main line circle marker */}
                <circle
                  cx={coord.x}
                  cy={coord.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? '#3b82f6' : '#ffffff'}
                  stroke="#3b82f6"
                  strokeWidth={isHovered ? 3.5 : 2.5}
                  className="transition-all duration-200"
                />
                {/* Bottom X Labels */}
                <text
                  x={coord.x}
                  y={chartHeight + 35}
                  fill="#71717a"
                  fontSize="8"
                  textAnchor="middle"
                  className="font-black uppercase tracking-wider"
                >
                  {coord.pt.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Dynamic coordinate hover card */}
        {activePt !== null && (
          <div className="absolute top-2 right-2 bg-zinc-900 text-white rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest shadow-xl animate-in zoom-in-95 duration-200">
            {points[activePt].label}: <span className="text-blue-400">{points[activePt].value} Users</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 5. PlatformRevenueRadial
// ==========================================
export function PlatformRevenueRadial() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // High density subscription allocation values
  const indicators = [
    { label: 'Fee Yield', val: 78, max: 100, radius: 75, color: '#3b82f6', bgLight: '#eff6ff', desc: 'Active commission fees collected from bookings vs platform targets.' },
    { label: 'SaaS Volume', val: 62, max: 100, radius: 55, color: '#10b981', bgLight: '#ecfdf5', desc: 'Landlord monthly software service subscriptions quota status.' },
    { label: 'Listing Capacity', val: 88, max: 100, radius: 35, color: '#f59e0b', bgLight: '#fffbeb', desc: 'Total listing cap load vs current active server load threshold.' },
  ];

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-white/60 backdrop-blur-md rounded-3xl border border-zinc-150 shadow-sm w-full">
      <div className="flex flex-col space-y-2 flex-1">
        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faChartLine} className="text-zinc-400" />
          Financial Telemetry
        </h3>
        <p className="text-2xl font-black text-zinc-900 tracking-tight">Platform Allocation</p>
        <p className="text-xs text-zinc-500 font-medium">Concentric breakdown of platform utility capacities and transactional revenue models.</p>

        <div className="flex flex-col gap-2 pt-4">
          {indicators.map((ind, idx) => (
            <div 
              key={ind.label}
              className={`p-3 rounded-2xl border transition-all duration-300 cursor-pointer ${
                hoveredIdx === idx ? 'border-zinc-300 bg-zinc-50 shadow-sm' : 'border-transparent'
              }`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase tracking-widest text-zinc-600 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCircle} style={{ color: ind.color }} className="h-2 w-2" />
                  {ind.label}
                </span>
                <span className="text-xs font-black text-zinc-800">{ind.val}%</span>
              </div>
              {hoveredIdx === idx && (
                <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed animate-in fade-in duration-300 font-bold">{ind.desc}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center justify-center h-48 w-48">
        <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
          {indicators.map((ind, idx) => {
            const circumference = 2 * Math.PI * ind.radius;
            const strokeDashoffset = circumference - (ind.val / ind.max) * circumference;
            const isHovered = hoveredIdx === idx;

            return (
              <g key={ind.label}>
                {/* Background track circle */}
                <circle
                  cx="100"
                  cy="100"
                  r={ind.radius}
                  fill="transparent"
                  stroke={ind.color}
                  strokeWidth={isHovered ? 12 : 8}
                  opacity="0.08"
                  className="transition-all duration-300"
                />
                {/* Filled indicator circle */}
                <circle
                  cx="100"
                  cy="100"
                  r={ind.radius}
                  fill="transparent"
                  stroke={ind.color}
                  strokeWidth={isHovered ? 12 : 8}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-500 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-black text-zinc-900 tracking-tighter leading-none">
            {hoveredIdx !== null ? `${indicators[hoveredIdx].val}%` : 'Platform'}
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-1">
            {hoveredIdx !== null ? indicators[hoveredIdx].label : 'OS Status'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. FinancialYieldGrid
// ==========================================
export function FinancialYieldGrid() {
  const metrics = [
    { title: 'Net Operating Income', value: 'KES 420,000', icon: faCoins, rate: '+8.4%', up: true, desc: 'Operational income remaining after total maintenance costs.' },
    { title: 'Gross Asset Yield', value: '11.8%', icon: faChartLine, rate: 'Prime Rate', up: true, desc: 'Total yearly earnings return relative to purchase evaluations.' },
    { title: 'Maintenance Ratio', value: '4.2%', icon: faWarehouse, rate: '-1.2%', up: false, desc: 'Percent allocation from cash flow back to physical utilities.' },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-3 w-full">
      {metrics.map((m) => (
        <div key={m.title} className="p-6 bg-white/60 backdrop-blur-md rounded-3xl border border-zinc-150 shadow-sm flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 group">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-zinc-700 shadow-sm group-hover:scale-110 transition-transform duration-300">
              <FontAwesomeIcon icon={m.icon} className="h-4 w-4" />
            </div>
            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
              m.up ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {m.rate}
            </span>
          </div>

          <div className="mt-6 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{m.title}</p>
            <p className="text-2xl font-black text-zinc-900 tracking-tight tabular-nums">{m.value}</p>
          </div>

          <p className="text-[10px] text-zinc-400 mt-4 leading-relaxed font-bold border-t border-zinc-100/80 pt-3">{m.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 7. EdukaSplineChart (Eduka Reference Chart)
// ==========================================
export function EdukaSplineChart({ payments = [] }: { payments?: any[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(3);

  // 4 sample or derived collection points (1 Dec, 8 Dec, 16 Dec, 31 Dec)
  const points = [
    { label: '1 Dec', val: 45, display: 'KES 45,000' },
    { label: '8 Dec', val: 140, display: 'KES 140,000' },
    { label: '16 Dec', val: 80, display: 'KES 80,000' },
    { label: '31 Dec', val: 165, display: 'KES 165,000' },
  ];

  // SVG dimensions
  const width = 340;
  const height = 140;
  const max = 200;

  // Compute coordinates
  const coords = points.map((pt, i) => ({
    x: 40 + i * ((width - 70) / (points.length - 1)),
    y: height - (pt.val / max) * (height - 30) - 10,
    ...pt
  }));

  // Smooth spline path
  const pathD = coords.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) / 2;
    const cy2 = pt.y;
    return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${coords[coords.length - 1].x},${height} L ${coords[0].x},${height} Z`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-xs flex flex-col justify-between w-full">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tenant Participation</h4>
        <span className="text-[10px] font-semibold text-slate-400">Show: <span className="text-blue-500 font-bold">Monthly ▾</span></span>
      </div>

      <div className="relative w-full h-[150px]">
        <svg viewBox={`0 0 ${width} ${height + 25}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="eduka-spline-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00c569" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00c569" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[0, 50, 100, 150, 200].map((level) => {
            const y = height - (level / max) * (height - 30) - 10;
            return (
              <g key={level}>
                <line x1="30" y1={y} x2={width} y2={y} stroke="#eef2f6" strokeDasharray="3 3" strokeWidth="1" />
                <text x="10" y={y + 3} fill="#94a3b8" fontSize="8" className="font-semibold">{level}</text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#eduka-spline-grad)" />

          {/* Spline stroke */}
          <path d={pathD} fill="none" stroke="#00c569" strokeWidth="2.5" strokeLinecap="round" />

          {/* Indicator vertical line and dots */}
          {coords.map((pt, i) => {
            const isHovered = hoveredPoint === i;
            return (
              <g key={pt.label} className="cursor-pointer" onClick={() => setHoveredPoint(i)} onMouseEnter={() => setHoveredPoint(i)}>
                {isHovered && (
                  <>
                    <line x1={pt.x} y1={pt.y} x2={pt.x} y2={height} stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                    {/* Tooltip badge */}
                    <rect x={pt.x + 6} y={pt.y - 12} width="40" height="18" rx="6" fill="#1e293b" />
                    <text x={pt.x + 26} y={pt.y} fill="#ffffff" fontSize="8" fontBold="true" textAnchor="middle">{pt.val}</text>
                  </>
                )}
                <circle cx={pt.x} cy={pt.y} r={isHovered ? 5 : 3.5} fill="#ffffff" stroke="#00c569" strokeWidth="2.5" />
                <text x={pt.x} y={height + 18} fill="#64748b" fontSize="8.5" textAnchor="middle" className="font-medium">{pt.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ==========================================
// 8. EdukaDonutChart (Eduka Reference Donut)
// ==========================================
export function EdukaDonutChart() {
  const segments = [
    { label: 'Residential', pct: 35, color: '#ff5722' },
    { label: 'Commercial', pct: 20, color: '#8c45ff' },
    { label: 'BNB / Short', pct: 30, color: '#0094ff' },
    { label: 'Vacant', pct: 10, color: '#00c569' },
    { label: 'Other', pct: 5, color: '#f59e0b' },
  ];

  let currentAngle = 0;
  const radius = 40;
  const strokeWidth = 14;
  const center = 55;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 shadow-xs flex flex-col justify-between w-full">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">Total Improvement</h4>
        <span className="text-[10px] font-semibold text-slate-400">Show: <span className="text-blue-500 font-bold">This month ▾</span></span>
      </div>

      <div className="flex items-center justify-between gap-4 mt-2">
        {/* SVG Donut Ring */}
        <div className="w-[110px] h-[110px] shrink-0 relative flex items-center justify-center">
          <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
            {segments.map((seg, i) => {
              const angle = (seg.pct / 100) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + angle;
              currentAngle = endAngle;

              return (
                <path
                  key={seg.label}
                  d={describeArc(center, center, radius, startAngle + 1, endAngle - 1)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-slate-600 dark:text-slate-300 text-[11px] truncate font-medium">{seg.label}</span>
              </div>
              <span className="text-slate-400 text-[11px] font-bold tabular-nums ml-2">{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

