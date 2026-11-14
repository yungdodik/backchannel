import mock from "@/mock/icebreaker.json";
import { assertReport, ndjsonResponse, paced, reportToEvents } from "@/lib/replay";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mock") === "1") {
    assertReport(mock);
    return ndjsonResponse(paced(reportToEvents(mock)));
  }
  return ndjsonResponse(
    (async function* () {
      yield { type: "error" as const, message: "Live reports not available yet" };
    })(),
  );
}
