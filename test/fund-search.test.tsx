import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FundSearch } from "@/components/fund-search";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function submit(q: string) {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: q } });
  fireEvent.submit(screen.getByRole("search"));
}

describe("FundSearch", () => {
  it("fetches matches and links them to the report", async () => {
    const fetchMock = stubFetch([
      { calaId: "70fb3317-cd8c-4c52-aa86-66502789bce3", name: "Icebreaker.vc", description: "VC" },
    ]);
    render(<FundSearch />);
    submit("icebreaker");
    const link = await screen.findByRole("link", { name: /Icebreaker\.vc/ });
    expect(link).toHaveAttribute("href", "/report/70fb3317-cd8c-4c52-aa86-66502789bce3");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/funds?q=icebreaker");
    expect(url).toContain("mock=1");
  });

  it("shows an empty state", async () => {
    stubFetch([]);
    render(<FundSearch />);
    submit("zzz");
    expect(await screen.findByText("No matching funds")).toBeInTheDocument();
  });

  it("shows an error on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    render(<FundSearch />);
    submit("x");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
