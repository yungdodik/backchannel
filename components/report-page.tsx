"use client";

import Link from "next/link";
import { reportUrl } from "@/components/api-urls";
import { ReportView } from "@/components/report-view";
import { useReportStream } from "@/components/use-report-stream";

export function ReportPage({ calaId }: { calaId: string }) {
  const { events } = useReportStream(reportUrl(calaId));
  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← New search
      </Link>
      <ReportView events={events} />
    </div>
  );
}
