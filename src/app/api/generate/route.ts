import { NextRequest, NextResponse } from "next/server";
import { submitVideo } from "@/lib/falClient";
import { checkBudget, estimateCost } from "@/lib/budget";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const {
      startImage,
      endImage,
      prompt,
      negativePrompt,
      duration,
      mode,
    } = body;

    if (!startImage || !endImage) {
      return NextResponse.json(
        { error: "起点と終点の画像が必要です" },
        { status: 400 }
      );
    }
    if (!prompt) {
      return NextResponse.json(
        { error: "プロンプトが必要です" },
        { status: 400 }
      );
    }

    // === 予算ガードレール: 生成前に上限チェック ===
    const budget = checkBudget();
    if (!budget.allowed) {
      return NextResponse.json(
        {
          error: budget.reason,
          budgetExceeded: true,
          used: budget.used,
          limit: budget.limit,
        },
        { status: 429 }
      );
    }

    const result = await submitVideo({
      startImageBase64: startImage,
      endImageBase64: endImage,
      prompt,
      negativePrompt,
      duration,
      mode,
    });

    return NextResponse.json({
      taskId: result.requestId,
      model: result.model,
      user: getUser(req),
      estimatedCost: estimateCost(duration || "5", mode || "pro"),
    });
  } catch (e: any) {
    console.error("generate error:", e);
    return NextResponse.json(
      { error: e.message || "unknown error" },
      { status: 500 }
    );
  }
}
