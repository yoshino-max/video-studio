import { NextRequest, NextResponse } from "next/server";
import { getVideoStatus } from "@/lib/falClient";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const model = req.nextUrl.searchParams.get("model");
    if (!model) {
      return NextResponse.json(
        { error: "model パラメータが必要です" },
        { status: 400 }
      );
    }

    const result = await getVideoStatus(model, params.taskId);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("poll error:", e);
    return NextResponse.json(
      { error: e.message || "unknown error" },
      { status: 500 }
    );
  }
}
