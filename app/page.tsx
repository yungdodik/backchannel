import { cacheLife } from "next/cache";
import { ParallaxApp } from "@/components/parallax-app";
import { PRESET_FUNDS } from "@/components/presets";
import type { SkyFund } from "@/components/sky/engine";
import { cachedReports } from "@/lib/cached-reports";
import type { Report } from "@/lib/types";

/** The prepared funds become the brightest stars; their size comes from the cached report. */
async function skyFunds(): Promise<SkyFund[]> {
  "use cache";
  cacheLife("max");
  return Promise.all(
    PRESET_FUNDS.map(async ({ name, calaId }) => {
      const load = cachedReports[calaId];
      if (!load) return { id: calaId, name };
      const report = (await load()).default as Report;
      return { id: calaId, name, companies: report.portfolio.length, calls: report.callList.length };
    }),
  );
}

export default async function Home() {
  return <ParallaxApp funds={await skyFunds()} />;
}
