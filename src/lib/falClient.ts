import { fal } from "@fal-ai/client";

let configured = false;

function ensureConfig() {
  if (!configured) {
    const key = process.env.FAL_KEY;
    if (!key) {
      throw new Error("FAL_KEY を環境変数に設定してください");
    }
    fal.config({ credentials: key });
    configured = true;
  }
}

// 終点フレーム(end_image_url)に対応したKlingモデルを使用
const MODEL_PRO =
  process.env.FAL_MODEL_PRO || "fal-ai/kling-video/v2.6/pro/image-to-video";
const MODEL_STD =
  process.env.FAL_MODEL_STD || "fal-ai/kling-video/v2.1/standard/image-to-video";

function modelFor(mode: string): string {
  return mode === "std" ? MODEL_STD : MODEL_PRO;
}

// base64のdataURLをfalストレージにアップロードして公開URLを返す
// （fal.aiは画像をbase64ではなく公開URLで受け取るため）
async function uploadDataUrl(dataUrl: string): Promise<string> {
  ensureConfig();
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("画像データの形式が不正です");
  }
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const blob = new Blob([buffer], { type: mime });
  const url = await fal.storage.upload(blob);
  return url;
}

export interface SubmitParams {
  startImageBase64: string;
  endImageBase64: string;
  prompt: string;
  negativePrompt?: string;
  duration?: "5" | "10";
  mode?: "std" | "pro";
}

export async function submitVideo(
  params: SubmitParams
): Promise<{ requestId: string; model: string }> {
  ensureConfig();
  const model = modelFor(params.mode || "pro");

  // 起点・終点画像をアップロードしてURL化
  const startUrl = await uploadDataUrl(params.startImageBase64);
  const endUrl = await uploadDataUrl(params.endImageBase64);

  const { request_id } = await fal.queue.submit(model, {
    input: {
      prompt: params.prompt,
      start_image_url: startUrl,
      end_image_url: endUrl, // 終点フレーム
      duration: params.duration || "5",
      negative_prompt: params.negativePrompt || "",
      cfg_scale: 0.5,
    },
  });

  return { requestId: request_id, model };
}

export interface StatusResult {
  status: "submitted" | "processing" | "succeed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}

export async function getVideoStatus(
  model: string,
  requestId: string
): Promise<StatusResult> {
  ensureConfig();

  try {
    const status = await fal.queue.status(model, {
      requestId,
      logs: false,
    });

    // fal.aiのステータス: IN_QUEUE / IN_PROGRESS / COMPLETED
    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(model, { requestId });
      const data: any = result.data;
      const videoUrl = data?.video?.url;
      if (!videoUrl) {
        return { status: "failed", errorMessage: "動画URLが取得できませんでした" };
      }
      return { status: "succeed", videoUrl };
    }

    if (status.status === "IN_PROGRESS") {
      return { status: "processing" };
    }

    return { status: "submitted" };
  } catch (e: any) {
    return {
      status: "failed",
      errorMessage: e.message || "ステータス取得に失敗しました",
    };
  }
}
