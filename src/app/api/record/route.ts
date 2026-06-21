import { NextRequest, NextResponse } from "next/server";
import { recordGeneration, estimateCost } from "@/lib/budget";

export const runtime = "nodejs";

function getUser(req: NextRequest): string {
  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = Buffer.from(encoded, "base64").toString();
        const [user] = decoded.split(":");
        return user || "unknown";
      } catch {}
    }
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, promptJa, duration, mode, aspectRatio } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const costUsd = estimateCost(duration || "5", mode || "pro");

    recordGeneration({
      taskId,
      user: getUser(req),
      promptJa: promptJa || "",
      duration: duration || "5",
      mode: mode || "pro",
      aspectRatio: aspectRatio || "16:9",
      costUsd,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("record error:", e);
    return NextResponse.json(
      { error: e.message || "unknown error" },
      { status: 500 }
    );
  }
}
