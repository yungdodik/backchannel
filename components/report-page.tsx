"use client";

import Link from "next/link";
import { reportUrl } from "@/components/api-urls";
import { ReportView } from "@/components/report-view";
import { useReportStream } from "@/components/use-report-stream";

export function ReportPage({ calaId }: { calaId: string }) {
  const { events } = useReportStream(reportUrl(calaId));
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to the sky
      </Link>
      <ReportView events={events} />
    </main>
  );
}
