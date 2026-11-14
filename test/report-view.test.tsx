import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReportView } from "@/components/report-view";
import { reportToEvents } from "@/lib/replay";
import type { Report, StreamEvent } from "@/lib/types";
import mock from "@/mock/icebreaker.json";

const report = mock as Report;
const all = reportToEvents(report); // progress, portfolio, 11 × entry, done
const upToPortfolio = all.slice(0, 2);

afterEach(cleanup);

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
});
