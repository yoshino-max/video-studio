import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cachedClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY を環境変数に設定してください");
    }
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

const SYSTEM_PROMPT = `あなたは映像演出のディレクター兼Kling AIプロンプトエンジニアです。
ユーザーの日本語の動きの指示を、Kling AIが高品質な動画を生成できる
英語の映像演出プロンプト（最大250語）に変換してください。

必ず以下の要素を含めること:
1. カメラワーク（例: slow dolly in, orbit shot, static, handheld）
2. 被写体のアクション（具体的な動詞で）
3. ライティング/ムード（例: cinematic lighting, golden hour）
4. スタイル（例: photorealistic, cinematic, anime）
5. 起点と終点の繋ぎ方への明確な言及

出力は厳密にこのJSON形式のみ:
{"prompt": "英語の演出プロンプト", "negative_prompt": "避けたい要素を英語で"}`;

export interface OptimizeResult {
  prompt: string;
  negativePrompt: string;
}

export async function optimizePrompt(
  userInputJa: string,
  startImageDataUrl?: string,
  endImageDataUrl?: string
): Promise<OptimizeResult> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (startImageDataUrl && endImageDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `ユーザーの指示: ${userInputJa}\n\n以下の2枚の画像を、起点と終点として動画化したいです。` },
        { type: "image_url", image_url: { url: startImageDataUrl, detail: "low" } },
        { type: "image_url", image_url: { url: endImageDataUrl, detail: "low" } },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `ユーザーの指示: ${userInputJa}`,
    });
  }

  const resp = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 600,
  });

  const content = resp.choices[0].message.content;
  if (!content) {
    throw new Error("OpenAIからの応答が空でした");
  }

  const parsed = JSON.parse(content);
  return {
    prompt: parsed.prompt || "",
    negativePrompt: parsed.negative_prompt || "blurry, low quality, distorted",
  };
}
