import { Badge } from "@/components/ui/badge";

export function FlagBadge({ flag }: { flag: "low" | "high" | "critical" | null | string }) {
  if (!flag) return <Badge variant="success">in range</Badge>;
  if (flag === "critical") return <Badge variant="destructive">critical</Badge>;
  return <Badge variant="warning">{flag}</Badge>;
}
