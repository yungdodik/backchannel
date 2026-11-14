// Live adapters from env. Module-level so all requests in an instance share one Cala queue (D17).
import { createCalaClient } from "@/lib/cala";
import { createExa } from "@/lib/exa";
import { createGemini } from "@/lib/gemini";
import type { PipelineDeps } from "@/lib/pipeline";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

let cala: ReturnType<typeof createCalaClient> | undefined;
export const liveCala = () => (cala ??= createCalaClient({ fetch, apiKey: env("CALA_API_KEY"), minGapMs: Number(process.env.CALA_MIN_GAP_MS ?? 1000) }));

export function liveDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cala: liveCala(),
    exa: createExa(env("EXA_API_KEY")),
    gemini: createGemini(env("GEMINI_API_KEY")),
    now: () => new Date(),
    budgetMs: Infinity,
    ...over,
  };
}
