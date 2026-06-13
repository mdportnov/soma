import { Badge } from "@/components/ui/badge";

/**
 * `evaluated=false` means unit conversion failed, so the value was never checked
 * against a reference range — we must NOT render a green "in range", which would
 * silently present an unverified value as normal.
 */
export function FlagBadge({
  flag,
  evaluated = true,
}: {
  flag: "low" | "high" | "critical" | null | string;
  evaluated?: boolean;
}) {
  if (!evaluated)
    return (
      <Badge
        variant="secondary"
        title="Unit not recognized — value not checked against its reference range"
      >
        not evaluated
      </Badge>
    );
  if (!flag) return <Badge variant="success">in range</Badge>;
  if (flag === "critical") return <Badge variant="destructive">critical</Badge>;
  return <Badge variant="warning">{flag}</Badge>;
}
