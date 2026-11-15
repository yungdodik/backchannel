"use client";

import { useEffect, useRef, useState } from "react";
import { ContactLink, CopyBrief } from "@/components/call-actions";
import { contactRole, entryKey, reasonToCall, shortlist } from "@/lib/call-brief";
import { profile } from "@/lib/fund-profile";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deriveReport } from "@/components/report-state";
import type { CallGroup, CallListEntry, PortfolioCompany, Source, StreamEvent } from "@/lib/types";

const GROUPS: { group: CallGroup; title: string }[] = [
  { group: "news_event", title: "News found (acquisition, shutdown, layoffs)" },
  { group: "no_recent_round", title: "No recorded round in 24+ months" },
  { group: "recent_round", title: "Raised again recently" },
];

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const month = (iso?: string) => iso?.slice(0, 7);

/** A clickable "domain · YYYY-MM" link to one source. */
function SourceChip({ source }: { source: Source }) {
  const label = [domain(source.url), month(source.date)].filter(Boolean).join(" · ");
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {label}
    </a>
  );
}

function CopyQuestionsButton({ questions }: { questions: string[] }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
    } catch {
      next = "failed";
    }
    setStatus(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy questions"}
    </Button>
  );
}

function EntryCard({ entry, company, fund }: { entry: CallListEntry; company?: PortfolioCompany; fund: string }) {
  const { founder } = entry;
  const headingId = `entry-${entry.companyId}-${founder.name}`.replace(/\W+/g, "-");
  return (
    <Card role="article" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <h3 id={headingId}>{founder.name}</h3>
          <Badge variant="outline">{contactRole(founder)}</Badge>
          <Badge variant="secondary">{founder.via === "cala" ? "via Cala" : "via web"}</Badge>
        </CardTitle>
        <CardDescription>
          <p className="font-medium text-foreground">{entry.companyName}</p>
          {founder.evidence && <p>{founder.evidence}</p>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-medium">{reasonToCall(entry)}</p>
        {company?.overview && <div><p>{company.overview.text}</p><details><summary>AI overview · sources</summary>{company.overview.sources.map((source) => <SourceChip key={source.url} source={source} />)}</details></div>}
        <div className="flex flex-wrap gap-1">{founder.sources.map((source) => <SourceChip key={source.url} source={source} />)}</div>
        <ul className="list-disc space-y-1.5 pl-5">
          {entry.why.map((sig, i) => (
            <li key={i}>
              <span className="mr-2">{sig.text}</span>
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {sig.sources.map((src) => (
                  <SourceChip key={src.url} source={src} />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <ol aria-label="Questions" className="list-decimal space-y-1 pl-5">
          {entry.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2"><CopyBrief fund={fund} entries={[entry]} /><ContactLink entry={entry} /><CopyQuestionsButton questions={entry.questions} /></div>
      </CardContent>
    </Card>
  );
}

function fundLed(c: PortfolioCompany): string {
  if (c.rounds.some((r) => r.fundIsLead === true)) return "✓";
  if (c.rounds.length && c.rounds.every((r) => r.fundIsLead === false)) return "not in recorded rounds";
  return "—";
}

function PortfolioTable({ companies }: { companies: PortfolioCompany[] }) {
  return (
    <section aria-label="Portfolio">
      <Collapsible className="rounded-xl ring-1 ring-foreground/10">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left font-medium">
          Portfolio ({companies.length} companies)
          <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Last recorded round</TableHead>
                <TableHead>Fund led</TableHead>
                <TableHead>Founders found</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.calaId}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{month(c.lastRoundDate) ?? "—"}</TableCell>
                  <TableCell>{fundLed(c)}</TableCell>
                  <TableCell>{c.founders.length}</TableCell>
                  <TableCell>
                    {c.state === "pending" ? (
                      <Skeleton data-testid="state-pending" className="h-4 w-16" />
                    ) : c.state === "not_researched" ? "not researched" : c.state === "unavailable" ? (
                      <span className="text-muted-foreground">not available</span>
                    ) : (
                      "checked"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function ReportSkeleton() {
  return (
    <div data-testid="report-skeleton" aria-busy="true" className="space-y-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** Pure render of a report from the stream events received so far (spec Part B, seam 1). */
export function ReportView({ events, onRetry }: { events: StreamEvent[]; onRetry?: () => void }) {
  const s = deriveReport(events);
  const picks = shortlist(s.entries);
  const pickKeys = new Set(picks.map(entryKey));
  const fp = s.report ? profile(s.report) : null;

  const banner = s.error && (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {s.error}
      {onRetry && <button className="px-btn" onClick={onRetry}>Retry research</button>}
    </div>
  );

  if (!s.fund) {
    return (
      <div className="space-y-4">
        {banner}
        {!s.error && <ReportSkeleton />}
      </div>
    );
  }

  const checked = s.checked;
  const researched = s.companies.filter((c) => c.state === "enriched").length;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{s.fund.name}</h1>
        {s.fund.description && <p className="text-muted-foreground">{s.fund.description}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {s.progress && <span>{s.progress}</span>}
          <span>
            {checked}/{s.companies.length} companies checked
          </span>
          {s.complete === false && <Badge variant="outline">Partial report</Badge>}
        </p>
      </header>
      {banner}
      {(s.report?.portfolioTruncated || s.companies.length >= 200) && <p className="text-sm text-muted-foreground">Showing up to 200 recorded investments. This is a partial portfolio snapshot.</p>}
      <div className="space-y-1"><p className="text-sm text-muted-foreground">{researched} of {s.companies.length} companies researched · {s.companies.filter((c) => c.state === "unavailable").length} unavailable · {s.companies.filter((c) => c.state === "not_researched").length} not researched</p>
      <p className="text-sm text-muted-foreground">{s.report ? `${s.report.prepared ? "Prepared report" : "Research snapshot"} · updated ${s.report.generatedAt.slice(0, 10)}` : "Live research · up to 25 companies"}</p></div>
      {picks.length > 0 && <section aria-label="Recommended contacts" className="space-y-3">
        <h2 className="text-xl font-semibold">{picks.length === 1 ? "Start with this contact" : `Start with these ${picks.length}`}</h2>
        <p className="text-sm text-muted-foreground">One person per company, a mix of recorded experiences. Direct profiles and sourced founder roles are preferred. This is a starting set, not a rating.</p>
        <CopyBrief fund={s.fund.name} entries={picks} />
        {picks.map((entry) => <EntryCard key={entryKey(entry)} entry={entry} company={s.companies.find((c) => c.calaId === entry.companyId)} fund={s.fund!.name} />)}
      </section>}
      {fp && <details className="rounded-xl border p-4 space-y-3"><summary>Fund context &amp; source records</summary>
        <p>No recorded round in 24+ months: {fp.noRoundIn24Months.n} of {fp.noRoundIn24Months.of} companies with dated rounds.</p>
        <p>{fp.namedInLaterRound.of ? `Fund named in a later round: at least ${fp.namedInLaterRound.n} of ${fp.namedInLaterRound.of} eligible companies.` : "Follow-on participation: insufficient researched evidence."}</p>
        <p>{fp.ledRounds.of ? `Rounds led: ${fp.ledRounds.n} of ${fp.ledRounds.of} rounds with a known lead.` : "Rounds led: insufficient researched evidence."}</p>
        {fp.medianMonthsBetweenRounds != null && <p>Median time between recorded rounds: {Math.round(fp.medianMonthsBetweenRounds)} months.</p>}
        {fp.topCoInvestors.length > 0 && <p>Co-investors: {fp.topCoInvestors.map((c) => `${c.name} (${c.roundIds.length} rounds)`).join(", ")}</p>}
        {fp.partners.length > 0 && <p>Partners quoted: {fp.partners.map((p) => `${p.name}${p.title ? `, ${p.title}` : ""}`).join("; ")}</p>}
        <details><summary>Check the round sources behind these counts</summary>{s.companies.map((c) => <div key={c.calaId}><h3>{c.name}</h3>{c.rounds.map((r) => <p key={r.calaId}>{r.date?.slice(0, 7) ?? "Undated"} · {r.fundNamed ? "Fund named" : "Participation unconfirmed"} · {r.fundIsLead === true ? "Fund led" : ""} {r.sources.map((source) => <SourceChip key={source.url} source={source} />)}</p>)}</div>)}</details>
      </details>}
      {s.complete !== undefined && s.entries.length === 0 && (
        <p className="text-muted-foreground">
          No founders to call yet. None of the checked portfolio companies had a dated round or news with a
          founder we could confirm. The portfolio table below shows what was checked.
        </p>
      )}
      <details className="space-y-4"><summary>All other contacts ({s.entries.length - picks.length})</summary>
      {GROUPS.map(({ group, title }) => {
        const entries = s.entries.filter((e) => e.group === group && !pickKeys.has(entryKey(e)));
        if (!entries.length) return null;
        return (
          <section key={group} aria-label={title} className="space-y-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="grid gap-4">
              {entries.map((e) => (
                <EntryCard key={entryKey(e)} entry={e} company={s.companies.find((c) => c.calaId === e.companyId)} fund={s.fund!.name} />
              ))}
            </div>
          </section>
        );
      })}
      </details>
      <PortfolioTable companies={s.companies} />
      <footer className="text-sm text-muted-foreground">
        Facts from public sources via Cala and Exa. A missing round is not evidence that a company failed.
      </footer>
    </div>
  );
}
