import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getPanelResults, listPanels } from "@/db/repos";
import { buildComparison, displayValue } from "@/lib/lab-compare";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function LabCompare() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const { data: panels, loading } = useQuery(() => listPanels(profileId), [profileId]);

  const [aId, setAId] = React.useState<string | null>(null);
  const [bId, setBId] = React.useState<string | null>(null);

  // Default to the two most recent panels (older → newer), once they load.
  React.useEffect(() => {
    if (!panels || panels.length < 2) return;
    setBId((prev) => prev ?? String(panels[0].id));
    setAId((prev) => prev ?? String(panels[1].id));
  }, [panels]);

  const { data: cmp, loading: cmpLoading } = useQuery(async () => {
    if (!aId || !bId || aId === bId) return null;
    const [ra, rb] = await Promise.all([
      getPanelResults(Number(aId)),
      getPanelResults(Number(bId)),
    ]);
    return { ra, rb };
  }, [aId, bId]);

  if (loading || !panels) return <Loading />;

  const header = (
    <PageHeader
      back="/labs"
      breadcrumbs={crumbs(
        { label: t("nav.labResults"), to: "/labs" },
        { label: t("labCompare.title") },
      )}
      title={t("labCompare.title")}
      description={t("labCompare.description")}
    />
  );

  if (panels.length < 2) {
    return (
      <>
        {header}
        <EmptyState icon={TestTubes} title={t("labCompare.needTwoPanels")} />
      </>
    );
  }

  const options: ComboboxOption[] = panels.map((p) => ({
    value: String(p.id),
    label: `${formatDate(p.date)}${p.labName ? ` — ${p.labName}` : ""}`,
    keywords: [p.labName, p.city, p.country].filter((s): s is string => !!s),
  }));

  const panelById = new Map(panels.map((p) => [String(p.id), p]));
  const a = aId ? panelById.get(aId) : undefined;
  const b = bId ? panelById.get(bId) : undefined;
  const rows = cmp && a && b ? buildComparison(cmp.ra, a.date, cmp.rb, b.date) : [];

  return (
    <>
      {header}

      <Card className="mb-4">
        <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("labCompare.panelA")}
            </span>
            <Combobox
              value={aId}
              onChange={(v) => setAId(v)}
              options={options}
              placeholder={t("labCompare.panelA")}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("labCompare.panelB")}
            </span>
            <Combobox
              value={bId}
              onChange={(v) => setBId(v)}
              options={options}
              placeholder={t("labCompare.panelB")}
            />
          </div>
        </CardContent>
      </Card>

      {aId && bId && aId === bId ? (
        <EmptyState icon={ArrowLeftRight} title={t("labCompare.samePanel")} />
      ) : cmpLoading || !cmp ? (
        <EmptyState icon={ArrowLeftRight} title={t("labCompare.selectPrompt")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("labCompare.columns.biomarker")}</TableHead>
                  <TableHead>{a ? formatDate(a.date) : t("labCompare.panelA")}</TableHead>
                  <TableHead>{b ? formatDate(b.date) : t("labCompare.panelB")}</TableHead>
                  <TableHead>{t("labCompare.columns.change")}</TableHead>
                  <TableHead>{t("labCompare.columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const av = row.a ? displayValue(row.a) : null;
                  const bv = row.b ? displayValue(row.b) : null;
                  const status = row.b ?? row.a;
                  return (
                    <TableRow key={row.biomarkerId}>
                      <TableCell>
                        <Link
                          to={`/biomarkers/${row.biomarkerId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.biomarker.canonicalName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {row.biomarker.category}
                        </p>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {av ? (
                          `${formatValue(av.value)} ${av.unit}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {bv ? (
                          `${formatValue(bv.value)} ${bv.unit}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.change ? (
                          <DeltaBadge change={row.change} unit={bv?.unit} />
                        ) : row.a && row.b ? (
                          <span
                            className="text-[11px] text-muted-foreground"
                            title={t("insights.unitChanged")}
                          >
                            {t("insights.unitChangedShort")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <FlagBadge
                          flag={status?.outOfRange ? status.flag : null}
                          evaluated={status ? status.valueNormalized != null : false}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
