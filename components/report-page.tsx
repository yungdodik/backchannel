"use client";

import { useState } from "react";
import Link from "next/link";
import { reportUrl } from "@/components/api-urls";
import { ReportView } from "@/components/report-view";
import { useReportStream } from "@/components/use-report-stream";

export function ReportPage({ calaId }: { calaId: string }) {
  const [retry, setRetry] = useState(0);
  const { events } = useReportStream(reportUrl(calaId), retry);
  return (
    <main className="px-standalone mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Link href="/#sky" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to the sky
      </Link>
      <ReportView events={events} onRetry={() => setRetry((n) => n + 1)} />
    </main>
  );
}
