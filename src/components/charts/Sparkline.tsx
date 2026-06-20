import { Line, LineChart, ReferenceArea, ResponsiveContainer, YAxis } from "recharts";

/**
 * Minimal inline trend line for a biomarker card — no axes, labels or tooltip,
 * just the shape of the last few readings. The optimal band (when known) is
 * shaded so "drifting toward / away from optimal" reads at a glance; the final
 * point is dotted and colored by its flag. Renders nothing below two points.
 */
export function Sparkline({
  values,
  optimalLow,
  optimalHigh,
  lastOutOfRange = false,
  className = "h-8 w-20",
}: {
  values: number[];
  optimalLow?: number | null;
  optimalHigh?: number | null;
  lastOutOfRange?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  const data = values.map((value, i) => ({ i, value }));
  const min = Math.min(...values, optimalLow ?? Infinity);
  const max = Math.max(...values, optimalHigh ?? -Infinity);
  const span = Math.max(max - min, Math.abs(max) * 0.05, 1e-6);
  const domain: [number, number] = [min - span * 0.1, max + span * 0.1];
  const lastIndex = data.length - 1;

  return (
    <div className={className} aria-hidden>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={domain} hide />
          {optimalLow != null && optimalHigh != null && (
            <ReferenceArea
              y1={optimalLow}
              y2={optimalHigh}
              fill="var(--success)"
              fillOpacity={0.12}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; key?: string }) => {
              const { cx, cy, index, key } = props;
              if (index !== lastIndex || cx == null || cy == null) return <g key={key} />;
              return (
                <circle
                  key={key}
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={lastOutOfRange ? "var(--destructive)" : "var(--primary)"}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
