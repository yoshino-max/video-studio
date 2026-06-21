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
  const [showHelp, setShowHelp] = useState(false);

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
    if (!localStorage.getItem("video-tool-help-seen")) {
      setShowHelp(true);
      localStorage.setItem("video-tool-help-seen", "1");
    }
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
        body: JSON.stringify({ promptJa, startImage, endImage }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      setPromptEn(data.prompt);
      setNegativePrompt(data.negativePrompt);
    } catch (e: any) {
      setError(`プロンプト最適化に失敗しました: ${e.message}`);
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
    if (
      budget &&
      budget.limit !== null &&
      budget.remaining !== null &&
      budget.remaining <= 0
    ) {
      setError(
        `今月のチーム生成上限（${budget.limit}本）に達しています。来月まで待つか、管理者に上限引き上げを依頼してください。`
      );
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress({ pct: 10, stage: "動画AIにタスクを送信中..." });

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
        if (err.budgetExceeded) await fetchBudget();
        throw new Error(err.error || "生成に失敗しました");
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
          throw new Error(err.error || "ステータス取得に失敗しました");
        }
        const status = await pollRes.json();

        const pct = Math.min(25 + attempts * 1.2, 90);
        setProgress({ pct, stage: `動画を生成中（${attempts * 10}秒経過）...` });

        if (status.status === "succeed" && status.videoUrl) {
          setProgress({ pct: 100, stage: "完成しました" });
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
          try {
            await fetch("/api/record", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId, promptJa, duration, mode, aspectRatio }),
            });
            await fetchBudget();
          } catch {}
          break;
        }
        if (status.status === "failed") {
          throw new Error(status.errorMessage || "生成に失敗しました");
        }
      }
      if (attempts >= maxAttempts) {
        throw new Error("時間がかかりすぎました（10分以上）。もう一度お試しください。");
      }
    } catch (e: any) {
      setError(`生成に失敗しました: ${e.message}`);
    } finally {
      setGenerating(false);
      setTimeout(() => setProgress({ pct: 0, stage: "" }), 2000);
    }
  };

  const estimatedCost = () => {
    const base = mode === "pro" ? 33 : 20;
    const credits = duration === "10" ? Math.round(base * 1.8) : base;
    return `約 ${Math.round(credits)} 円`;
  };

  const limitReached =
    budget?.remaining !== null &&
    budget?.remaining !== undefined &&
    budget.remaining <= 0;

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 60 }}>
      {/* ヘッダー */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 18,
              }}
            >
              ▶
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
                Video Studio
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                AIで動画をつくる
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowHelp(true)} style={ghostBtn}>
              使い方
            </button>
            <Link href="/dashboard" style={{ ...ghostBtn, display: "inline-flex", alignItems: "center" }}>
              利用状況
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "20px" }}>
        {/* 予算バー */}
        {budget && budget.limit !== null && (
          <div style={{ ...card, padding: "14px 18px", marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <span style={{ color: "var(--fg-muted)" }}>
                今月のチーム利用：<strong style={{ color: "var(--fg)" }}>{budget.used}</strong> / {budget.limit}本
              </span>
              <span style={{ color: "var(--fg-muted)" }}>残り {budget.remaining}本</span>
            </div>
            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(100, (budget.used / budget.limit) * 100)}%`,
                  height: "100%",
                  background: limitReached
                    ? "var(--danger)"
                    : budget.used / budget.limit >= 0.7
                    ? "var(--warning)"
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
              padding: "12px 16px",
              background: "var(--danger-soft)",
              color: "var(--danger)",
              borderRadius: var_radius_sm,
              marginBottom: 16,
              fontSize: 13,
              border: "1px solid #f5c2c0",
            }}
          >
            {error}
          </div>
        )}

        {/* 手順1: 画像 */}
        <section style={{ ...card, marginBottom: 16 }}>
          <div style={stepLabel}>
            <span style={stepNum}>1</span>
            <span>起点と終点の画像を選ぶ</span>
          </div>
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
                    border: img ? "1px solid var(--border)" : "2px dashed var(--border-strong)",
                    borderRadius: var_radius_sm,
                    aspectRatio: "1",
                    background: img ? "#000" : "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    overflow: "hidden",
                    position: "relative",
                    transition: "border-color 0.15s",
                  }}
                >
                  {img ? (
                    <>
                      <img src={img} alt={which} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                          background: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          borderRadius: "50%",
                          width: 26,
                          height: 26,
                          fontSize: 15,
                        }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "1rem" }}>
                      <div style={{ fontSize: 28, color: "var(--fg-subtle)" }}>＋</div>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 2px" }}>
                        {which === "start" ? "最初のコマ" : "最後のコマ"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--fg-subtle)", margin: 0 }}>
                        クリックして画像を選ぶ
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <input ref={startInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFileSelect(e, "start")} />
          <input ref={endInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFileSelect(e, "end")} />
        </section>

        {/* 手順2: プロンプト */}
        <section style={{ ...card, marginBottom: 16 }}>
          <div style={stepLabel}>
            <span style={stepNum}>2</span>
            <span>どう動かしたいか書く（日本語でOK）</span>
          </div>
          <textarea
            value={promptJa}
            onChange={(e) => setPromptJa(e.target.value)}
            placeholder="例：カメラがゆっくり引きながら商品が一回転し、最後に夕日の背景へ変わる"
            style={{ minHeight: 84, resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{promptJa.length} 文字</span>
            <button onClick={handleOptimize} disabled={optimizing || !promptJa.trim()} style={{ ...secondaryBtn, opacity: optimizing || !promptJa.trim() ? 0.5 : 1 }}>
              {optimizing ? "変換中..." : "AIで指示文を整える"}
            </button>
          </div>
          {promptEn && (
            <div style={{ marginTop: 14, padding: 14, background: "var(--accent-soft)", borderRadius: var_radius_sm, border: "1px solid #d6dffb" }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>
                整えた指示文（英語・編集できます）
              </div>
              <textarea
                value={promptEn}
                onChange={(e) => setPromptEn(e.target.value)}
                style={{ minHeight: 80, background: "var(--surface)", fontSize: 13, resize: "vertical" }}
              />
            </div>
          )}
        </section>

        {/* 手順3: 設定 */}
        <section style={{ ...card, marginBottom: 16 }}>
          <div style={stepLabel}>
            <span style={stepNum}>3</span>
            <span>仕上がりを設定する</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={fieldLabel}>長さ</label>
              <Segmented options={[{ value: "5", label: "5秒" }, { value: "10", label: "10秒" }]} value={duration} onChange={(v) => setDuration(v as any)} />
            </div>
            <div>
              <label style={fieldLabel}>画面の形</label>
              <Segmented options={[{ value: "16:9", label: "横長" }, { value: "9:16", label: "縦長" }, { value: "1:1", label: "正方形" }]} value={aspectRatio} onChange={(v) => setAspectRatio(v as any)} />
            </div>
            <div>
              <label style={fieldLabel}>画質</label>
              <Segmented options={[{ value: "std", label: "標準（安い）" }, { value: "pro", label: "高品質" }]} value={mode} onChange={(v) => setMode(v as any)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label style={fieldLabel}>めやす費用 / 時間</label>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", paddingTop: 6 }}>
                <strong style={{ color: "var(--fg)" }}>{estimatedCost()}</strong> ・ 約60秒
              </div>
            </div>
          </div>
        </section>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          disabled={generating || !startImage || !endImage || limitReached}
          style={{
            ...primaryBtn,
            opacity: generating || !startImage || !endImage || limitReached ? 0.45 : 1,
          }}
        >
          {limitReached ? "今月の上限に達しました" : generating ? "生成中..." : "動画をつくる"}
        </button>

        {progress.pct > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>
              <span>{progress.stage}</span>
              <span>{Math.round(progress.pct)}%</span>
            </div>
            <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${progress.pct}%`, height: "100%", background: "var(--accent)", transition: "width 0.3s" }} />
            </div>
          </div>
        )}

        {/* ギャラリー */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
            つくった動画（{gallery.length}件）
          </h2>
          {gallery.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "32px 20px", color: "var(--fg-subtle)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
              <p style={{ fontSize: 13, margin: 0 }}>まだ動画はありません。上のフォームから最初の1本をつくってみましょう。</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {gallery.map((item) => (
                <a key={item.id} href={item.videoUrl} target="_blank" rel="noopener noreferrer" style={{ ...card, padding: 0, overflow: "hidden", color: "inherit" }}>
                  <div style={{ aspectRatio: "16/9", background: `url(${item.thumbnailDataUrl}) center/cover, #000`, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontSize: 14 }}>▶</div>
                    </div>
                    <span style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 999 }}>
                      {item.duration}秒
                    </span>
                  </div>
                  <div style={{ padding: "8px 10px", fontSize: 12 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.promptJa || "（指示文なし）"}
                    </div>
                    <div style={{ color: "var(--fg-subtle)", fontSize: 11, marginTop: 2 }}>
                      {new Date(item.createdAt).toLocaleString("ja-JP")}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 使い方モーダル */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

const var_radius_sm = "8px";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "18px",
  boxShadow: "var(--shadow-sm)",
};

const stepLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 14,
};

const stepNum: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--fg-muted)",
  marginBottom: 6,
};

const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: 15,
  background: "var(--accent)",
  color: "#fff",
  borderRadius: "10px",
  fontSize: 15,
  fontWeight: 600,
  boxShadow: "var(--shadow-sm)",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: "8px",
  color: "var(--accent)",
};

const ghostBtn: React.CSSProperties = {
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 500,
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: "8px",
  color: "var(--fg-muted)",
};

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 8, padding: 3, gap: 3 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "7px 4px",
            fontSize: 12.5,
            fontWeight: value === opt.value ? 600 : 500,
            background: value === opt.value ? "var(--surface)" : "transparent",
            color: value === opt.value ? "var(--accent)" : "var(--fg-muted)",
            borderRadius: 6,
            boxShadow: value === opt.value ? "var(--shadow-sm)" : "none",
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: "1", t: "画像を2枚えらぶ", d: "動画の「最初のコマ」と「最後のコマ」になる画像をアップロードします。この2枚の間をAIが動画でつなぎます。" },
    { n: "2", t: "動きを日本語で書く", d: "「商品が回転しながら夕日に変わる」のように、どう動かしたいかを書きます。「AIで指示文を整える」を押すと、AIがより伝わる表現に変換します。" },
    { n: "3", t: "仕上がりを設定する", d: "長さ・画面の形・画質を選びます。高品質ほどキレイですが費用も少し上がります。めやす費用がその場で表示されます。" },
    { n: "4", t: "「動画をつくる」を押す", d: "60秒ほど待つと動画ができます。完成した動画は下の一覧に並び、クリックすると開けます。" },
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16,24,40,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          maxWidth: 460,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          animation: "slideUp 0.2s ease",
        }}
      >
        <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>使い方ガイド</h2>
          <button onClick={onClose} style={{ fontSize: 22, color: "var(--fg-subtle)", lineHeight: 1, width: 32, height: 32 }}>×</button>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 18px" }}>
            画像2枚と日本語の指示だけで、AIが動画をつくります。4ステップで完成します。
          </p>
          {steps.map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <span style={{ ...stepNum, width: 26, height: 26 }}>{s.n}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.t}</div>
                <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>{s.d}</div>
              </div>
            </div>
          ))}
          <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4 }}>
            <strong style={{ color: "var(--fg)" }}>ヒント：</strong> つくった動画のリンクは時間が経つと消えることがあります。気に入った動画は早めにダウンロードして保存してください。
          </div>
        </div>
        <div style={{ padding: "0 22px 22px" }}>
          <button onClick={onClose} style={{ ...primaryBtn, padding: 13 }}>
            はじめる
          </button>
        </div>
      </div>
    </div>
  );
}
