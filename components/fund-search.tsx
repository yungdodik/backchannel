"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fundsUrl } from "@/components/api-urls";
import { PRESET_FUNDS } from "@/components/presets";
import type { FundMatch } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "done"; matches: FundMatch[] };

export function FundSearch() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const seq = useRef(0);

  async function search(text: string) {
    const query = text.trim();
    if (!query) return;
    const id = ++seq.current;
    setState({ kind: "loading" });
    try {
      const res = await fetch(fundsUrl(query));
      if (!res.ok) throw new Error(String(res.status));
      const matches = (await res.json()) as FundMatch[];
      if (id === seq.current) setState({ kind: "done", matches });
    } catch {
      if (id === seq.current) setState({ kind: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <Input
          type="search"
          aria-label="Fund name"
          placeholder="Fund name, e.g. Icebreaker.vc"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="lg" disabled={state.kind === "loading"}>
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-2" aria-label="Example funds">
        {PRESET_FUNDS.map((p) =>
          p.calaId ? (
            <Link
              key={p.name}
              href={`/report/${p.calaId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              {p.name}
            </Link>
          ) : (
            <Button
              key={p.name}
              type="button"
              variant="outline"
              onClick={() => {
                setQ(p.name);
                void search(p.name);
              }}
            >
              {p.name}
            </Button>
          ),
        )}
      </div>

      <div aria-live="polite">
        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Searching…</p>
        )}
        {state.kind === "error" && (
          <p role="alert" className="text-sm text-destructive">
            Could not search funds. Please try again.
          </p>
        )}
        {state.kind === "done" && state.matches.length === 0 && (
          <p className="text-sm text-muted-foreground">No matching funds</p>
        )}
        {state.kind === "done" && state.matches.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {state.matches.map((m) => (
              <li key={m.calaId}>
                <Link
                  href={`/report/${m.calaId}`}
                  className="flex flex-col gap-0.5 px-3 py-2.5 hover:bg-muted"
                >
                  <span className="font-medium">{m.name}</span>
                  {m.description && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {m.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
