import { connection } from "next/server";
import { savedStore, topFunds } from "@/lib/saved-reports";

/** The most opened funds researched live by anyone, for the sky (the rest stay findable through search). Request-time (connection), never prerendered. */
export async function GET() {
  await connection();
  try {
    const funds = topFunds(await savedStore().list());
    return Response.json(funds.map(({ id, name, companies, calls }) => ({ id, name, companies, calls })));
  } catch (e) {
    console.error("listing saved reports failed", e);
    return Response.json([]);
  }
}
