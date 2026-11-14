/** Caps concurrent calls to one external API (spec Limits: Exa and Gemini 5 each). */
export function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
