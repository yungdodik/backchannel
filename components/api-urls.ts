/** The ONE switch: set to false to use the live API (B5). */
export const USE_MOCK = false;

function build(path: string, params: Record<string, string>): string {
  const sp = new URLSearchParams(params);
  if (USE_MOCK) sp.set("mock", "1");
  return `${path}?${sp.toString()}`;
}

export const fundsUrl = (q: string) => build("/api/funds", { q });
export const reportUrl = (calaId: string) => build("/api/report", { fund: calaId });
