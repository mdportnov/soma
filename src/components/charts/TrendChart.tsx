import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Biomarker } from "@/db/schema";
import type { SeriesPoint } from "@/db/repos";
import { formatDate, formatValue } from "@/lib/utils";

export type MedOverlay = {
  id: number;
  name: string;
  start: string; // ISO date
  end: string | null;
  color: string;
};

export type SymptomOverlay = {
  date: string; // ISO date
  name: string;
  severity: number;
  notes?: string | null;
};

export const OVERLAY_COLORS = [
  "#0d9488",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
];

const DAY = 86400000;

function ts(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

/**
 * Biomarker trend line with reference/optimal bands and optional medication
 * intake periods rendered as translucent vertical bands — the visual
 * "took X → marker Z moved" correlation.
 */
export function TrendChart({
  series,
  biomarker,
  overlays = [],
  symptomOverlays = [],
}: {
  series: SeriesPoint[];
  biomarker: Biomarker;
  overlays?: MedOverlay[];
  symptomOverlays?: SymptomOverlay[];
}) {
  const data = series.map((p) => ({ ...p, t: ts(p.date) }));
  // Captured once per mount: keeps render pure and the domain stable.
  const [now] = useState(() => Date.now());

  const tMin = Math.min(...data.map((d) => d.t), ...overlays.map((o) => ts(o.start)));
  const tMax = Math.max(...data.map((d) => d.t), now);
  const pad = Math.max((tMax - tMin) * 0.04, 7 * DAY);
  const domain: [number, number] = [tMin - pad, tMax + pad];

  const values = data.map((d) => d.value);
  const { refLow, refHigh, optimalLow, optimalHigh } = biomarker;
  const yCandidates = [...values, refLow, refHigh, optimalLow, optimalHigh].filter(
    (v): v is number => v != null,
  );
  const yMin = Math.min(...yCandidates);
  const yMax = Math.max(...yCandidates);
  const ySpan = Math.max(yMax - yMin, Math.abs(yMax) * 0.1, 1e-6);
  const yDomain: [number, number] = [Math.max(0, yMin - ySpan * 0.15), yMax + ySpan * 0.15];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={domain}
            tickFormatter={(t) => formatDate(new Date(t).toISOString())}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            yAxisId="value"
            domain={yDomain}
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => formatValue(v)}
          />
          {/* Hidden secondary axis for symptom-severity overlays. */}
          <YAxis yAxisId="severity" domain={[0, 10]} hide />

          {/* Reference band (lab norm) and optimal band (biohacking target) */}
          {refLow != null && refHigh != null && (
            <ReferenceArea
              yAxisId="value"
              y1={refLow}
              y2={refHigh}
              fill="var(--success)"
              fillOpacity={0.07}
              stroke="var(--success)"
              strokeOpacity={0.25}
              strokeDasharray="4 4"
            />
          )}
          {optimalLow != null && optimalHigh != null && (
            <ReferenceArea
              yAxisId="value"
              y1={optimalLow}
              y2={optimalHigh}
              fill="var(--success)"
              fillOpacity={0.12}
            />
          )}

          {/* Medication intake periods as vertical bands */}
          {overlays.map((o) => {
            const x1 = Math.max(ts(o.start), domain[0]);
            const x2 = Math.min(o.end ? ts(o.end) : now, domain[1]);
            if (x2 <= x1) return null;
            return (
              <ReferenceArea
                key={`med-${o.id}`}
                yAxisId="value"
                x1={x1}
                x2={x2}
                fill={o.color}
                fillOpacity={0.08}
                stroke={o.color}
                strokeOpacity={0.35}
                strokeDasharray="2 4"
              />
            );
          })}

          {/* Symptom events as vertical reference lines (severity-coded). */}
          {symptomOverlays.map((s, i) => {
            const x = ts(s.date);
            if (x < domain[0] || x > domain[1]) return null;
            const severe = s.severity >= 6;
            const moderate = s.severity >= 3;
            const stroke = severe ? "#dc2626" : moderate ? "#d97706" : "#9ca3af";
            return (
              <ReferenceLine
                key={`symptom-${i}-${s.date}`}
                yAxisId="severity"
                x={x}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray={severe ? undefined : "4 3"}
                label={{
                  value: String(s.severity),
                  position: "top",
                  fill: stroke,
                  fontSize: 9,
                }}
              />
            );
          })}

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">
                    {formatValue(p.value)} {p.unit}
                  </p>
                  <p className="text-muted-foreground">{formatDate(p.date)}</p>
                  {p.labName && <p className="text-muted-foreground">{p.labName}</p>}
                  {p.outOfRange && (
                    <p className="font-medium text-destructive">out of range ({p.flag})</p>
                  )}
                </div>
              );
            }}
          />
          <Line
            yAxisId="value"
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload, index } = props;
              return (
                <circle
                  key={`dot-${index}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={payload.outOfRange ? "var(--destructive)" : "var(--primary)"}
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              );
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
