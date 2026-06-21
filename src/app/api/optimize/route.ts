import { NextRequest, NextResponse } from "next/server";
import { optimizePrompt } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { promptJa, startImage, endImage } = body;

    if (!promptJa) {
      return NextResponse.json(
        { error: "promptJa is required" },
        { status: 400 }
      );
    }

    const result = await optimizePrompt(promptJa, startImage, endImage);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("optimize error:", e);
    return NextResponse.json(
      { error: e.message || "unknown error" },
      { status: 500 }
    );
  }
}
