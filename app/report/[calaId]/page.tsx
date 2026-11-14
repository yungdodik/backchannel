import { Suspense } from "react";
import { ReportPage } from "@/components/report-page";
import { Skeleton } from "@/components/ui/skeleton";

// Cache Components is on: params are runtime data, so they must be read inside <Suspense>.
async function Report({ params }: { params: PageProps<"/report/[calaId]">["params"] }) {
  const { calaId } = await params;
  return <ReportPage calaId={calaId} />;
}

export default function Page(props: PageProps<"/report/[calaId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
      <Report params={props.params} />
    </Suspense>
  );
}
