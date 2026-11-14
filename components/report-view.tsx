"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  CallGroup,
  CallListEntry,
  FundMatch,
  PortfolioCompany,
  Source,
  StreamEvent,
} from "@/lib/types";

const GROUPS: { group: CallGroup; title: string }[] = [
  { group: "news_event", title: "News found (acquisition, shutdown, layoffs)" },
  { group: "no_recent_round", title: "No recorded round in 24+ months" },
  { group: "recent_round", title: "Raised again recently" },
];

interface ViewState {
  fund?: FundMatch;
  companies: PortfolioCompany[];
  entries: CallListEntry[];
  progress?: string;
  error?: string;
  /** Set once `done` arrives. */
  complete?: boolean;
}

/** Folds the events received so far into what the page shows. */
function derive(events: StreamEvent[]): ViewState {
  const s: ViewState = { companies: [], entries: [] };
  for (const ev of events) {
    switch (ev.type) {
      case "progress":
        s.progress = ev.message;
        break;
      case "portfolio":
        s.fund = ev.fund;
        s.companies = ev.companies;
        break;
      case "company":
        s.companies = s.companies.map((c) => (c.calaId === ev.company.calaId ? ev.company : c));
        break;
      case "entry":
        s.entries = [...s.entries, ev.entry];
        break;
      case "done": // authoritative: replaces everything streamed so far
        s.fund = ev.report.fund;
        s.companies = ev.report.portfolio;
        s.entries = ev.report.callList;
        s.complete = ev.report.complete;
        s.progress = undefined;
        break;
      case "error":
        s.error = ev.message;
        break;
    }
  }
  return s;
}

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

function EntryCard({ entry }: { entry: CallListEntry }) {
  const { founder } = entry;
  const headingId = `entry-${entry.companyId}-${founder.name}`.replace(/\W+/g, "-");
  return (
    <Card role="article" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <h3 id={headingId}>{founder.name}</h3>
          {founder.linkedinUrl && (
            <a
              href={founder.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-normal text-blue-700 hover:underline dark:text-blue-400"
            >
              LinkedIn <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          <Badge variant="secondary">{founder.via === "cala" ? "via Cala" : "via web"}</Badge>
        </CardTitle>
        <CardDescription>
          <p className="font-medium text-foreground">{entry.companyName}</p>
          {founder.evidence && <p>{founder.evidence}</p>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <CopyQuestionsButton questions={entry.questions} />
      </CardContent>
    </Card>
  );
}

function fundLed(c: PortfolioCompany): string {
  if (c.rounds.some((r) => r.fundIsLead === true)) return "✓";
  if (c.rounds.some((r) => r.fundIsLead === false)) return "no";
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
                    ) : c.state === "unavailable" ? (
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
export function ReportView({ events }: { events: StreamEvent[] }) {
  const s = derive(events);

  const banner = s.error && (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {s.error}
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

  const checked = s.companies.filter((c) => c.state !== "pending").length;

  return (
    <div className="space-y-8">
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
      {s.complete !== undefined && s.entries.length === 0 && (
        <p className="text-muted-foreground">
          No founders to call yet. None of the checked portfolio companies had a dated round or news with a
          founder we could confirm. The portfolio table below shows what was checked.
        </p>
      )}
      {GROUPS.map(({ group, title }) => {
        const entries = s.entries.filter((e) => e.group === group);
        if (!entries.length) return null;
        return (
          <section key={group} aria-label={title} className="space-y-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="grid gap-4">
              {entries.map((e) => (
                <EntryCard key={`${e.companyId}:${e.founder.name}`} entry={e} />
              ))}
            </div>
          </section>
        );
      })}
      <PortfolioTable companies={s.companies} />
      <footer className="text-sm text-muted-foreground">
        Facts from public sources via Cala and Exa. A missing round is not evidence that a company failed.
      </footer>
    </div>
  );
}
