"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface GalleryItem {
  id: string;
  videoUrl: string;
  thumbnailDataUrl: string;
  promptJa: string;
  promptEn: string;
  duration: string;
  aspectRatio: string;
  createdAt: string;
}

interface BudgetInfo {
  used: number;
  limit: number | null;
  remaining: number | null;
  totalCostUsd: number;
}

export default function Home() {
  const [startImage, setStartImage] = useState<string | null>(null);
  const [endImage, setEndImage] = useState<string | null>(null);
  const [promptJa, setPromptJa] = useState("");
  const [promptEn, setPromptEn] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [mode, setMode] = useState<"std" | "pro">("pro");
  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, stage: "" });
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetInfo | null>(null);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  const fetchBudget = async () => {
    try {
      const res = await fetch("/api/budget");
      if (res.ok) {
        const d = await res.json();
        setBudget({
          used: d.used,
          limit: d.limit,
          remaining: d.remaining,
          totalCostUsd: d.totalCostUsd,
        });
      }
    } catch {}
  };

  useEffect(() => {
    const stored = localStorage.getItem("video-tool-gallery");
    if (stored) {
      try {
        setGallery(JSON.parse(stored));
      } catch {}
    }
    fetchBudget();
  }, []);

  const saveGallery = (items: GalleryItem[]) => {
    setGallery(items);
    localStorage.setItem("video-tool-gallery", JSON.stringify(items));
  };

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    which: "start" | "end"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("画像サイズは10MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (which === "start") setStartImage(dataUrl);
      else setEndImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleOptimize = async () => {
    if (!promptJa.trim()) {
      alert("日本語の指示を入力してください");
      return;
    }
    setOptimizing(true);
    setError(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptJa,
          startImage,
          endImage,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      setPromptEn(data.prompt);
      setNegativePrompt(data.negativePrompt);
    } catch (e: any) {
      setError(`プロンプト最適化に失敗: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!startImage || !endImage) {
      alert("起点と終点の画像を両方アップロードしてください");
      return;
    }
    const finalPrompt = promptEn || promptJa;
    if (!finalPrompt.trim()) {
      alert("プロンプトを入力してください（または最適化を実行）");
      return;
    }

    // 上限到達チェック（フロント側でも事前ブロック）
    if (budget && budget.limit !== null && budget.remaining !== null && budget.remaining <= 0) {
      setError(
        `今月のチーム生成上限（${budget.limit}本）に達しています。来月まで待つか、管理者に上限引き上げを依頼してください。`
      );
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress({ pct: 10, stage: "Kling APIにタスク送信中..." });

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startImage,
          endImage,
          prompt: finalPrompt,
          negativePrompt,
          duration,
          aspectRatio,
          mode,
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        if (err.budgetExceeded) {
          await fetchBudget();
        }
        throw new Error(err.error || "生成に失敗");
      }
      const { taskId, model } = await genRes.json();

      setProgress({ pct: 25, stage: "動画を生成中（約60秒）..." });

      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 10000));
        attempts++;

        const pollRes = await fetch(
          `/api/poll/${taskId}?model=${encodeURIComponent(model)}`
        );
        if (!pollRes.ok) {
          const err = await pollRes.json();
          throw new Error(err.error || "ステータス取得失敗");
        }
        const status = await pollRes.json();

        const pct = Math.min(25 + attempts * 1.2, 90);
        setProgress({
          pct,
          stage: `動画を生成中（${attempts * 10}秒経過）...`,
        });

        if (status.status === "succeed" && status.videoUrl) {
          setProgress({ pct: 100, stage: "完了！" });
          const newItem: GalleryItem = {
            id: taskId,
            videoUrl: status.videoUrl,
            thumbnailDataUrl: startImage,
            promptJa,
            promptEn: finalPrompt,
            duration,
            aspectRatio,
            createdAt: new Date().toISOString(),
          };
          saveGallery([newItem, ...gallery].slice(0, 30));

          // 生成成功をサーバーに記録（カウント加算）
          try {
            await fetch("/api/record", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                taskId,
                promptJa,
                duration,
                mode,
                aspectRatio,
              }),
            });
            await fetchBudget();
          } catch {}

          break;
        }
        if (status.status === "failed") {
          throw new Error(status.errorMessage || "生成失敗");
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error("タイムアウト（10分以上経過）");
      }
    } catch (e: any) {
      setError(`生成失敗: ${e.message}`);
    } finally {
      setGenerating(false);
      setTimeout(() => setProgress({ pct: 0, stage: "" }), 2000);
    }
  };

  const estimatedCost = () => {
    const base = mode === "pro" ? 33 : 20;
    const credits = duration === "10" ? Math.round(base * 1.8) : base;
    return `${credits} credits（≈$${(credits / 100).toFixed(2)}）`;
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>
            Video Studio
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            Start frame + end frame → AI動画生成
          </p>
        </div>
        <Link
          href="/dashboard"
          style={{
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "none",
            padding: "8px 14px",
            border: "0.5px solid var(--border)",
            borderRadius: 8,
            whiteSpace: "nowrap",
          }}
        >
          📊 ダッシュボード
        </Link>
      </header>

      {/* 予算バー */}
      {budget && budget.limit !== null && (
        <div
          style={{
            background: "var(--background)",
            border: "0.5px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 6,
            }}
          >
            <span>
              今月のチーム生成: {budget.used} / {budget.limit}本
            </span>
            <span>残り {budget.remaining}本</span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--surface)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (budget.used / budget.limit) * 100)}%`,
                height: "100%",
                background:
                  budget.remaining !== null && budget.remaining <= 0
                    ? "#dc2626"
                    : budget.used / budget.limit >= 0.7
                    ? "#d97706"
                    : "var(--accent)",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fee",
            color: "#991b1b",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <section style={cardStyle}>
        <label style={labelStyle}>起点と終点の画像</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(["start", "end"] as const).map((which) => {
            const img = which === "start" ? startImage : endImage;
            return (
              <div
                key={which}
                onClick={() =>
                  (which === "start" ? startInputRef : endInputRef).current?.click()
                }
                style={{
                  border: img
                    ? "0.5px solid var(--border)"
                    : "0.5px dashed var(--border)",
                  borderRadius: 12,
                  aspectRatio: "1",
                  background: img ? "#000" : "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {img ? (
                  <>
                    <img
                      src={img}
                      alt={which}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (which === "start") setStartImage(null);
                        else setEndImage(null);
                      }}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "50%",
                        width: 24,
                        height: 24,
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "1rem" }}>
                    <div style={{ fontSize: 32, color: "var(--muted)" }}>↑</div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        margin: "8px 0 2px",
                      }}
                    >
                      {which === "start" ? "起点フレーム" : "終点フレーム"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
                      クリックして選択
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <input
          ref={startInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFileSelect(e, "start")}
        />
        <input
          ref={endInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFileSelect(e, "end")}
        />
      </section>

      <section style={cardStyle}>
        <label style={labelStyle} htmlFor="prompt-ja">
          動きの指示（日本語OK）
        </label>
        <textarea
          id="prompt-ja"
          value={promptJa}
          onChange={(e) => setPromptJa(e.target.value)}
          placeholder="例: カメラがゆっくりズームアウトしながら商品が一回転、最後に夕日の背景に変わる"
          style={{ width: "100%", minHeight: 80, resize: "vertical" }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {promptJa.length} / 500
          </span>
          <button
            onClick={handleOptimize}
            disabled={optimizing || !promptJa.trim()}
            style={secondaryBtn}
          >
            {optimizing ? "変換中..." : "✨ ChatGPTで最適化"}
          </button>
        </div>

        {promptEn && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--accent-bg)",
              borderRadius: 8,
              border: "0.5px solid var(--accent)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6, color: "var(--accent)" }}>
              最適化済プロンプト（英語）— 編集可能
            </div>
            <textarea
              value={promptEn}
              onChange={(e) => setPromptEn(e.target.value)}
              style={{
                width: "100%",
                minHeight: 80,
                background: "transparent",
                border: "none",
                fontSize: 13,
                color: "var(--accent)",
                resize: "vertical",
              }}
            />
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>尺</label>
            <SegmentedControl
              options={[
                { value: "5", label: "5秒" },
                { value: "10", label: "10秒" },
              ]}
              value={duration}
              onChange={(v) => setDuration(v as "5" | "10")}
            />
          </div>
          <div>
            <label style={labelStyle}>アスペクト比</label>
            <SegmentedControl
              options={[
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "1:1", label: "1:1" },
              ]}
              value={aspectRatio}
              onChange={(v) => setAspectRatio(v as any)}
            />
          </div>
          <div>
            <label style={labelStyle}>品質</label>
            <SegmentedControl
              options={[
                { value: "std", label: "Standard" },
                { value: "pro", label: "Pro" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as "std" | "pro")}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--muted)",
            marginTop: 14,
            paddingTop: 12,
            borderTop: "0.5px solid var(--border)",
          }}
        >
          <span>
            予想コスト: <strong style={{ color: "var(--foreground)" }}>{estimatedCost()}</strong>
          </span>
          <span>生成時間: 約60秒</span>
        </div>
      </section>

      <button
        onClick={handleGenerate}
        disabled={
          generating ||
          !startImage ||
          !endImage ||
          (budget?.remaining !== null && budget?.remaining !== undefined && budget.remaining <= 0)
        }
        style={{
          ...primaryBtn,
          opacity:
            generating ||
            !startImage ||
            !endImage ||
            (budget?.remaining !== null && budget?.remaining !== undefined && budget.remaining <= 0)
              ? 0.4
              : 1,
        }}
      >
        {budget?.remaining !== null &&
        budget?.remaining !== undefined &&
        budget.remaining <= 0
          ? "今月の上限に達しました"
          : generating
          ? "生成中..."
          : "▶ 動画を生成"}
      </button>

      {progress.pct > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 4,
            }}
          >
            <span>{progress.stage}</span>
            <span>{Math.round(progress.pct)}%</span>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--surface)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress.pct}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
          最近の生成（{gallery.length}件）
        </h2>
        {gallery.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            まだ生成された動画はありません。上のフォームで作成してください。
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {gallery.map((item) => (
              <a
                key={item.id}
                href={item.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "0.5px solid var(--border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    aspectRatio: "16/9",
                    background: `url(${item.thumbnailDataUrl}) center/cover, #000`,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: 8,
                      left: 8,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {item.duration}s · {item.aspectRatio}
                  </span>
                </div>
                <div style={{ padding: "8px 10px", fontSize: 12 }}>
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.promptJa || item.promptEn.slice(0, 40)}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                    {new Date(item.createdAt).toLocaleString("ja-JP")}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--background)",
  border: "0.5px solid var(--border)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: 14,
  background: "var(--foreground)",
  color: "var(--background)",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  marginTop: 12,
};

const secondaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  background: "var(--surface)",
  border: "0.5px solid var(--border)",
  borderRadius: 8,
};

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex" }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 13,
            background: value === opt.value ? "var(--accent-bg)" : "transparent",
            color: value === opt.value ? "var(--accent)" : "var(--muted)",
            border: "0.5px solid var(--border)",
            borderLeft: i > 0 ? "none" : "0.5px solid var(--border)",
            borderTopLeftRadius: i === 0 ? 8 : 0,
            borderBottomLeftRadius: i === 0 ? 8 : 0,
            borderTopRightRadius: i === options.length - 1 ? 8 : 0,
            borderBottomRightRadius: i === options.length - 1 ? 8 : 0,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
