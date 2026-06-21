import { NextResponse } from "next/server";
import { getBudgetState, getMonthlyLimit } from "@/lib/budget";

export const runtime = "nodejs";

export async function GET() {
  const state = getBudgetState();
  const limit = getMonthlyLimit();
  return NextResponse.json({
    month: state.month,
    used: state.totalCount,
    limit: limit === Infinity ? null : limit,
    remaining: limit === Infinity ? null : Math.max(0, limit - state.totalCount),
    totalCostUsd: state.totalCostUsd,
    records: state.records,
  });
}
