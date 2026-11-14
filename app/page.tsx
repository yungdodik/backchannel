import { FundSearch } from "@/components/fund-search";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Backchannel</h1>
        <p className="text-muted-foreground">
          Find the founders a fund didn&apos;t put on its reference list: portfolio founders to
          call, with sourced facts and questions to ask.
        </p>
      </header>
      <FundSearch />
    </div>
  );
}
