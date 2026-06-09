import * as React from "react";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createDiagnosis, deleteDiagnosis, listDiagnoses, updateDiagnosis } from "@/db/repos";
import type { Diagnosis } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, todayISO } from "@/lib/utils";

export function Diagnoses() {
  const { profileId } = useApp();
  const {
    data: diagnoses,
    loading,
    reload,
  } = useQuery(() => listDiagnoses(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Diagnosis | null>(null);

  if (loading || !diagnoses) return <Loading />;

  return (
    <>
      <PageHeader
        title="Diagnoses"
        description="Active conditions and resolved history."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add diagnosis
          </Button>
        }
      />

      {diagnoses.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No diagnoses recorded"
          description="Track conditions with status: active, in remission or resolved."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Diagnosis</TableHead>
                <TableHead>ICD</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {diagnoses.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.icdCode ?? "—"}</TableCell>
                  <TableCell>{formatDate(d.date)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        d.status === "active"
                          ? "warning"
                          : d.status === "resolved"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label="Edit"
                        onClick={() => {
                          setEditing(d);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label="Delete"
                        className="text-destructive"
                        onClick={async () => {
                          await deleteDiagnosis(d.id);
                          void reload();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DiagnosisForm
        open={formOpen}
        editing={editing}
        profileId={profileId}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

export function DiagnosisForm({
  open,
  editing,
  profileId,
  defaultVisitId,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Diagnosis | null;
  profileId: number;
  defaultVisitId?: number;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [icdCode, setIcdCode] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [status, setStatus] = React.useState<"active" | "remission" | "resolved">("active");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setIcdCode(editing?.icdCode ?? "");
    setDate(editing?.date ?? defaultDate ?? todayISO());
    setStatus(editing?.status ?? "active");
  }, [open, editing, defaultDate]);

  const save = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        name: name.trim(),
        icdCode: icdCode.trim() || null,
        date,
        status,
        visitId: editing ? editing.visitId : (defaultVisitId ?? null),
      };
      if (editing) await updateDiagnosis(editing.id, data);
      else await createDiagnosis(data);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={editing ? "Edit diagnosis" : "Add diagnosis"}>
      <div className="grid gap-3">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Subclinical hypothyroidism"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="ICD code (optional)">
            <Input
              value={icdCode}
              onChange={(e) => setIcdCode(e.target.value)}
              placeholder="E03.9"
            />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option>
              <option value="remission">Remission</option>
              <option value="resolved">Resolved</option>
            </Select>
          </Field>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !date}>
            {editing ? "Save changes" : "Add"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
