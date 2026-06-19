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
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const allData = series.map((p) => ({ ...p, t: ts(p.date) }));
  // Only normalized points share the biomarker's default unit; raw (unconverted)
  // points are on a different scale and must not be plotted on the same axis —
  // doing so fabricates a trend (e.g. mg/dL and mmol/L on one line). We drop them
  // from the line and surface a count instead. Fall back to raw only if nothing
  // normalized exists, so a custom-unit marker still renders something.
  const evaluatedData = allData.filter((d) => d.evaluated);
  const data = evaluatedData.length ? evaluatedData : allData;
  const hiddenCount = allData.length - evaluatedData.length;
  const usingRawFallback = evaluatedData.length === 0 && allData.length > 0;
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

  // Stagger flags of symptoms close in time downward so a dense cluster (e.g. a
  // few bad days in a row) stays readable instead of stacking on one spot.
  const symptomLevel = new Map<number, number>();
  {
    const threshold = (domain[1] - domain[0]) * 0.03;
    const lastXByLevel: number[] = [];
    symptomOverlays
      .map((s, i) => ({ i, x: ts(s.date) }))
      .filter((o) => o.x >= domain[0] && o.x <= domain[1])
      .sort((a, b) => a.x - b.x)
      .forEach((o) => {
        let lvl = 0;
        while (lastXByLevel[lvl] != null && o.x - lastXByLevel[lvl] < threshold) lvl++;
        lastXByLevel[lvl] = o.x;
        symptomLevel.set(o.i, lvl);
      });
  }

  return (
    <div className="w-full">
      {(hiddenCount > 0 || usingRawFallback) && (
        <p className="mb-1 text-[11px] text-warning">
          {usingRawFallback
            ? t("trendChart.unitsNotRecognized")
            : t("trendChart.pointsHidden", { count: String(hiddenCount) })}
        </p>
      )}
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ top: symptomOverlays.length ? 22 : 8, right: 12, bottom: 4, left: 0 }}
          >
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

            {/* Symptom events: a subtle severity-coded guide line topped by a
              readable severity "flag" with a native hover tooltip (name, the
              severity on a 1–10 scale, date and notes). */}
            {symptomOverlays.map((s, i) => {
              const x = ts(s.date);
              if (x < domain[0] || x > domain[1]) return null;
              const severe = s.severity >= 6;
              const stroke = severe ? "#dc2626" : s.severity >= 3 ? "#d97706" : "#9ca3af";
              const tip = [
                `${s.name} · ${t("trendChart.severityShort", { value: String(s.severity) })}`,
                formatDate(s.date),
                s.notes,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <ReferenceLine
                  key={`symptom-${i}-${s.date}`}
                  yAxisId="severity"
                  x={x}
                  stroke={stroke}
                  strokeWidth={severe ? 1.5 : 1}
                  strokeOpacity={0.5}
                  strokeDasharray={severe ? undefined : "4 3"}
                  label={(props: { viewBox?: { x?: number; y?: number } }) => {
                    const vx = props.viewBox?.x ?? 0;
                    const vy = props.viewBox?.y ?? 0;
                    const w = 16;
                    const h = 13;
                    const y = vy - h - 2 + (symptomLevel.get(i) ?? 0) * (h + 1);
                    return (
                      <g
                        transform={`translate(${vx - w / 2}, ${y})`}
                        style={{ pointerEvents: "auto", cursor: "default" }}
                      >
                        <title>{tip}</title>
                        <rect width={w} height={h} rx={3} fill={stroke} />
                        <text
                          x={w / 2}
                          y={h / 2 + 0.5}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={9}
                          fontWeight={600}
                          fill="#fff"
                        >
                          {s.severity}
                        </text>
                      </g>
                    );
                  }}
                />
              );
            })}

            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              wrapperStyle={{ outline: "none" }}
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
                      <p className="font-medium text-destructive">
                        {t("trendChart.outOfRange", { flag: p.flag ?? "" })}
                      </p>
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
      {symptomOverlays.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t("trendChart.symptomLegend")}</p>
      )}
    </div>
  );
}
