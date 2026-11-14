import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReportView } from "@/components/report-view";
import { reportToEvents } from "@/lib/replay";
import type { Report, StreamEvent } from "@/lib/types";
import mock from "@/mock/icebreaker.json";

const report = mock as Report;
const all = reportToEvents(report); // progress, portfolio, 11 × entry, done
const upToPortfolio = all.slice(0, 2);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("ReportView", () => {
  it("shows a skeleton before the portfolio arrives", () => {
    render(<ReportView events={all.slice(0, 1)} />);
    expect(screen.getByTestId("report-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/58 companies/)).not.toBeInTheDocument();
  });

  it("shows the fund and portfolio count once the portfolio arrives", () => {
    render(<ReportView events={upToPortfolio} />);
    expect(screen.queryByTestId("report-skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Icebreaker.vc" })).toBeInTheDocument();
    expect(screen.getByText(/Portfolio \(58 companies\)/)).toBeInTheDocument();
  });

  it("places entries in their group sections, in the spec's order", () => {
    render(<ReportView events={all} />);
    const sections = screen.getAllByRole("region", { name: /News found|No recorded round|Raised again/ });
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "News found (acquisition, shutdown, layoffs)",
      "No recorded round in 24+ months",
      "Raised again recently",
    ]);
    const [news, stale, recent] = sections;
    expect(within(news).getByText("Kair Käsper")).toBeInTheDocument();
    expect(within(stale).getByText("Avery Schrader")).toBeInTheDocument();
    expect(within(stale).getByText("[mock] Founder of IPRally")).toBeInTheDocument();
    expect(within(recent).getByText("[mock] Founder of Cytely")).toBeInTheDocument();
    expect(within(recent).queryByText("Avery Schrader")).not.toBeInTheDocument();
  });

  it("renders each signal with a source chip (domain + YYYY-MM) linking to its URL in a new tab", () => {
    render(<ReportView events={all} />);
    const card = screen.getByRole("article", { name: "Avery Schrader" });
    expect(within(card).getByText("Last recorded round: 2024-10")).toBeInTheDocument();
    const chip = within(card).getByRole("link", { name: "bebeez.eu · 2024-10" });
    expect(chip).toHaveAttribute(
      "href",
      "https://bebeez.eu/2024/10/31/estonias-modash-raises-12m-series-a-for-ai-driven-creator-discovery-and-payment-solutions/",
    );
    expect(chip).toHaveAttribute("target", "_blank");
    expect(within(card).getByRole("link", { name: "tech.eu · 2022-11" })).toHaveAttribute(
      "href",
      "https://tech.eu/2022/11/23/modash/",
    );
  });

  it("shows the founder's source badge, evidence, LinkedIn link and 3 questions", () => {
    render(<ReportView events={all} />);
    const cala = screen.getByRole("article", { name: "Avery Schrader" });
    expect(within(cala).getByText("via Cala")).toBeInTheDocument();
    expect(within(cala).getByText("Modash OÜ")).toBeInTheDocument();
    expect(within(cala).getByText("Cala: FOUNDED")).toBeInTheDocument();

    const web = screen.getByRole("article", { name: "Kair Käsper" });
    expect(within(web).getByText("via web")).toBeInTheDocument();
    expect(within(web).queryByText(/exa/i)).not.toBeInTheDocument();
    expect(within(web).getByRole("link", { name: /LinkedIn/ })).toHaveAttribute(
      "href",
      "https://ee.linkedin.com/in/kair",
    );
    const questions = within(web).getByRole("list", { name: "Questions" });
    expect(within(questions).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows the latest progress message and how many companies have been checked", () => {
    const company = { ...report.portfolio[0], state: "enriched" as const };
    const events: StreamEvent[] = [
      ...upToPortfolio,
      { type: "progress", message: "waiting for data source…" },
      { type: "company", company },
    ];
    render(<ReportView events={events} />);
    expect(screen.getByText("waiting for data source…")).toBeInTheDocument();
    expect(screen.queryByText("Loading cached report…")).not.toBeInTheDocument();
    // the mock portfolio has 11 enriched + 47 pending; FLOWHAVEN (pending) is now enriched
    expect(screen.getByText("12/58 companies checked")).toBeInTheDocument();
  });

  it("keeps the partial report and shows a banner after an error", () => {
    const events: StreamEvent[] = [...all.slice(0, 4), { type: "error", message: "Cala is unreachable" }];
    render(<ReportView events={events} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cala is unreachable");
    expect(screen.getByText("Avery Schrader")).toBeInTheDocument();
    expect(screen.getByText(/Portfolio \(58 companies\)/)).toBeInTheDocument();
  });

  it("marks a done report with complete: false as partial", () => {
    // the mock report has complete: false
    render(<ReportView events={all} />);
    expect(screen.getByText(/partial report/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading cached report…")).not.toBeInTheDocument();
  });

  describe("portfolio table", () => {
    const openTable = () => fireEvent.click(screen.getByRole("button", { name: /Portfolio \(58 companies\)/ }));
    const row = (name: string) => screen.getByRole("row", { name: new RegExp(`^${name}`) });

    it("is collapsed by default and opens to show one row per company", () => {
      render(<ReportView events={all} />);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      openTable();
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 58);
    });

    it("shows last round, fund led (✓ or —) and founders found", () => {
      render(<ReportView events={all} />);
      openTable();
      expect(row("Modash OÜ")).toHaveTextContent(/2024-10.*✓.*2/);
      expect(row("Hemby")).toHaveTextContent(/2022-05.*—/);
    });

    it("shows a skeleton for pending companies and 'not available' for unavailable ones", () => {
      const companies = report.portfolio.map((c) =>
        c.name === "Hemby" ? { ...c, state: "unavailable" as const } : c,
      );
      const events: StreamEvent[] = [{ type: "portfolio", fund: report.fund, companies }];
      render(<ReportView events={events} />);
      openTable();
      expect(within(row("FLOWHAVEN OY")).getByTestId("state-pending")).toBeInTheDocument();
      expect(row("Hemby")).toHaveTextContent("not available");
      expect(within(row("Hemby")).queryByTestId("state-pending")).not.toBeInTheDocument();
    });
  });

  it("hides empty group sections", () => {
    const onlyKlaus = all.filter((e) => e.type !== "entry" || e.entry.companyName === "Klaus").slice(0, -1);
    render(<ReportView events={onlyKlaus} />);
    expect(screen.getByRole("region", { name: /News found/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Raised again/ })).not.toBeInTheDocument();
  });

  describe("copy questions", () => {
    const card = () => screen.getByRole("article", { name: "Kair Käsper" });

    it("copies the 3 numbered questions and shows Copied", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      render(<ReportView events={all} />);
      fireEvent.click(within(card()).getByRole("button", { name: "Copy questions" }));
      expect(writeText).toHaveBeenCalledWith(
        "1. [mock] How involved was the fund in the acquisition talks?\n" +
          "2. [mock] Did they push for or against the sale?\n" +
          "3. [mock] Would you take their money again?",
      );
      expect(await within(card()).findByText("Copied")).toBeInTheDocument();
    });

    it("goes back to Copy questions after ~2 s", async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      vi.useFakeTimers();
      render(<ReportView events={all} />);
      fireEvent.click(within(card()).getByRole("button", { name: "Copy questions" }));
      await act(async () => {});
      expect(within(card()).getByText("Copied")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(within(card()).getByRole("button", { name: "Copy questions" })).toBeInTheDocument();
    });

    it("shows Copy failed when the write rejects", async () => {
      stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
      render(<ReportView events={all} />);
      fireEvent.click(within(card()).getByRole("button", { name: "Copy questions" }));
      expect(await within(card()).findByText("Copy failed")).toBeInTheDocument();
    });

    it("shows Copy failed when the clipboard is unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      render(<ReportView events={all} />);
      fireEvent.click(within(card()).getByRole("button", { name: "Copy questions" }));
      expect(await within(card()).findByText("Copy failed")).toBeInTheDocument();
    });
  });

  describe("empty call list", () => {
    const empty = { ...report, callList: [] } as Report;
    const text =
      "No founders to call yet. None of the checked portfolio companies had a dated round or news with a founder we could confirm. The portfolio table below shows what was checked.";

    it("explains an empty list once done has arrived", () => {
      render(<ReportView events={reportToEvents(empty)} />);
      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("does not explain while still streaming", () => {
      render(<ReportView events={reportToEvents(empty).slice(0, 2)} />);
      expect(screen.queryByText(/No founders to call yet/)).not.toBeInTheDocument();
    });

    it("does not show it when there are entries", () => {
      render(<ReportView events={all} />);
      expect(screen.queryByText(/No founders to call yet/)).not.toBeInTheDocument();
    });
  });

  it("shows the footer note once the portfolio has arrived", () => {
    const { unmount } = render(<ReportView events={all.slice(0, 1)} />);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    unmount();
    render(<ReportView events={upToPortfolio} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Facts from public sources via Cala and Exa. A missing round is not evidence that a company failed.",
    );
  });
});
