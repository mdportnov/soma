import { Link, useNavigate } from "react-router-dom";
import { Plus, Sparkles, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { listPanels } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export function Labs() {
  const { profileId } = useApp();
  const navigate = useNavigate();
  const { data: panels, loading } = useQuery(() => listPanels(profileId), [profileId]);

  if (loading || !panels) return <Loading />;

  return (
    <>
      <PageHeader
        title="Lab results"
        description="Every blood draw and urine test, manually entered or AI-imported."
        actions={
          <>
            <Link to="/labs/import">
              <Button variant="outline">
                <Sparkles /> AI import
              </Button>
            </Link>
            <Link to="/labs/new">
              <Button>
                <Plus /> New panel
              </Button>
            </Link>
          </>
        }
      />

      {panels.length === 0 ? (
        <EmptyState
          icon={TestTubes}
          title="No lab panels yet"
          description="Enter results manually or import a PDF/photo of a lab report with AI."
          action={
            <Link to="/labs/new">
              <Button size="sm">Add first panel</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lab</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Out of range</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/labs/${p.id}`)}
                >
                  <TableCell className="font-medium">{formatDate(p.date)}</TableCell>
                  <TableCell>{p.labName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.panelType}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{p.resultCount}</TableCell>
                  <TableCell>
                    {p.outOfRangeCount > 0 ? (
                      <Badge variant="warning">{p.outOfRangeCount}</Badge>
                    ) : (
                      <Badge variant="success">0</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.importMethod === "ai" ? (
                      <Badge>
                        <Sparkles className="size-3" /> AI
                      </Badge>
                    ) : (
                      <Badge variant="secondary">manual</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
