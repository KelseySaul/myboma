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
