import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS } from "@/lib/constants";
import { compactNumber, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const AXIS_STYLE = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;
const GRID_COLOR = "hsl(var(--border))";

type TooltipEntry = { name?: string; value?: number; color?: string; dataKey?: string | number };

/** Shared tooltip so every chart reads the same way. */
function ChartTooltip({
  active,
  payload,
  label,
  currency,
  suffix,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  currency: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="tabular ml-auto font-medium">
            {suffix ? `${entry.value ?? 0}${suffix}` : formatMoney(entry.value ?? 0, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut - category breakdown, salary allocation, asset allocation
// ---------------------------------------------------------------------------

export function DonutChart({
  data,
  currency = "INR",
  height = 260,
  innerRadius = 62,
  outerRadius = 92,
  centerLabel,
  centerValue,
  showLegend = true,
  emptyMessage = "No data yet",
  className,
}: {
  data: { name: string; value: number; color?: string }[];
  currency?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
  emptyMessage?: string;
  className?: string;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) return <EmptyChart height={height} message={emptyMessage} />;

  return (
    <div className={cn("relative", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="none"
          >
            {filtered.map((entry, index) => (
              <Cell key={entry.name} fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip currency={currency} />} />
          {showLegend ? (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              // Recharts sizes a horizontal legend from its content rather than
              // its container, which overflows narrow screens. Pinning the
              // wrapper to the container width makes the items wrap.
              wrapperStyle={{ width: "100%", left: 0, paddingTop: 4 }}
              formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
      {centerValue ? (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center"
          style={{ top: 0, height: showLegend ? height - 36 : height }}
        >
          <span className="tabular text-xl font-semibold">{centerValue}</span>
          {centerLabel ? (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouped bars - income vs expenses, monthly comparisons
// ---------------------------------------------------------------------------

export function GroupedBarChart({
  data,
  bars,
  currency = "INR",
  height = 280,
  xKey = "label",
  emptyMessage = "No data yet",
}: {
  data: Record<string, unknown>[];
  bars: { key: string; name: string; color?: string }[];
  currency?: string;
  height?: number;
  xKey?: string;
  emptyMessage?: string;
}) {
  if (!data.length) return <EmptyChart height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => compactNumber(v, currency)}
        />
        <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<ChartTooltip currency={currency} />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ width: "100%", left: 0 }}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
        {bars.map((bar, index) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars - spending by category
// ---------------------------------------------------------------------------

export function HorizontalBarChart({
  data,
  currency = "INR",
  height = 280,
  emptyMessage = "No spending recorded yet",
}: {
  data: { name: string; value: number; color?: string }[];
  currency?: string;
  height?: number;
  emptyMessage?: string;
}) {
  if (!data.length) return <EmptyChart height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compactNumber(v, currency)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={96}
        />
        <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<ChartTooltip currency={currency} />} />
        <Bar dataKey="value" name="Spent" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Trend line - savings rate, net worth, portfolio
// ---------------------------------------------------------------------------

export function TrendLineChart({
  data,
  lines,
  currency = "INR",
  height = 280,
  xKey = "label",
  suffix,
  emptyMessage = "No history yet",
}: {
  data: Record<string, unknown>[];
  lines: { key: string; name: string; color?: string }[];
  currency?: string;
  height?: number;
  xKey?: string;
  suffix?: string;
  emptyMessage?: string;
}) {
  if (!data.length) return <EmptyChart height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => (suffix ? `${v}${suffix}` : compactNumber(v, currency))}
        />
        <Tooltip content={<ChartTooltip currency={currency} suffix={suffix} />} />
        {lines.length > 1 ? (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ width: "100%", left: 0 }}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
        ) : null}
        {lines.map((line, index) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Area - net worth growth, cumulative spend
// ---------------------------------------------------------------------------

export function AreaTrendChart({
  data,
  areaKey,
  name,
  currency = "INR",
  height = 280,
  xKey = "label",
  color = "hsl(var(--chart-1))",
  emptyMessage = "No history yet",
}: {
  data: Record<string, unknown>[];
  areaKey: string;
  name: string;
  currency?: string;
  height?: number;
  xKey?: string;
  color?: string;
  emptyMessage?: string;
}) {
  if (!data.length) return <EmptyChart height={height} message={emptyMessage} />;
  const gradientId = `area-${areaKey}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => compactNumber(v, currency)}
        />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Area
          type="monotone"
          dataKey={areaKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
