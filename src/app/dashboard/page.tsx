"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BudgetData {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  totalCostUsd: number;
  records: {
    taskId: string;
    user: string;
    promptJa: string;
    duration: string;
    mode: string;
    aspectRatio: string;
    costUsd: number;
    createdAt: string;
  }[];
}

export default function Dashboard() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const usagePct =
    data && data.limit ? Math.min(100, (data.used / data.limit) * 100) : 0;

  // ユーザー別集計
  const byUser: Record<string, { count: number; cost: number }> = {};
  data?.records.forEach((r) => {
    if (!byUser[r.user]) byUser[r.user] = { count: 0, cost: 0 };
    byUser[r.user].count += 1;
    byUser[r.user].cost += r.costUsd;
  });

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>
            コストダッシュボード
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            {data?.month} のチーム利用状況
          </p>
        </div>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "none",
            padding: "8px 14px",
            border: "0.5px solid var(--border)",
            borderRadius: 8,
          }}
        >
          ← 生成画面へ
        </Link>
      </header>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>読み込み中...</p>
      ) : !data ? (
        <p style={{ color: "var(--muted)" }}>データを取得できませんでした。</p>
      ) : (
        <>
          {/* サマリーカード */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <SummaryCard
              label="今月の生成数"
              value={`${data.used}本`}
              sub={data.limit ? `/ ${data.limit}本` : "上限なし"}
            />
            <SummaryCard
              label="推定コスト"
              value={`$${data.totalCostUsd.toFixed(2)}`}
              sub={`≈ ¥${Math.round(data.totalCostUsd * 155).toLocaleString()}`}
            />
            <SummaryCard
              label="残り生成可能数"
              value={
                data.remaining === null ? "∞" : `${data.remaining}本`
              }
              sub={data.limit ? "今月" : "制限なし"}
            />
          </div>

          {/* 上限プログレスバー */}
          {data.limit && (
            <div
              style={{
                background: "var(--background)",
                border: "0.5px solid var(--border)",
                borderRadius: 12,
                padding: "1rem 1.25rem",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                <span style={{ color: "var(--muted)" }}>
                  チーム月次上限の消化率
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    color: usagePct >= 90 ? "#dc2626" : usagePct >= 70 ? "#d97706" : "var(--foreground)",
                  }}
                >
                  {usagePct.toFixed(0)}%
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  background: "var(--surface)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${usagePct}%`,
                    height: "100%",
                    background:
                      usagePct >= 90
                        ? "#dc2626"
                        : usagePct >= 70
                        ? "#d97706"
                        : "var(--accent)",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              {usagePct >= 70 && (
                <p
                  style={{
                    fontSize: 12,
                    color: usagePct >= 90 ? "#dc2626" : "#d97706",
                    margin: "8px 0 0",
                  }}
                >
                  {usagePct >= 90
                    ? "⚠ 上限間近です。使い切ると今月は生成できなくなります。"
                    : "残り少なくなっています。計画的に使用してください。"}
                </p>
              )}
            </div>
          )}

          {/* ユーザー別 */}
          {Object.keys(byUser).length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
                メンバー別利用状況
              </h2>
              <div
                style={{
                  border: "0.5px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {Object.entries(byUser)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([user, stats], i) => (
                    <div
                      key={user}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        fontSize: 13,
                        borderTop: i > 0 ? "0.5px solid var(--border)" : "none",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{user}</span>
                      <span style={{ color: "var(--muted)" }}>
                        {stats.count}本 · ${stats.cost.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* 生成履歴 */}
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
              生成履歴（直近{data.records.length}件）
            </h2>
            {data.records.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                まだ記録がありません。
              </p>
            ) : (
              <div
                style={{
                  border: "0.5px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {data.records.map((r, i) => (
                  <div
                    key={r.taskId + i}
                    style={{
                      padding: "10px 14px",
                      fontSize: 13,
                      borderTop: i > 0 ? "0.5px solid var(--border)" : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "60%",
                        }}
                      >
                        {r.promptJa || "(プロンプトなし)"}
                      </span>
                      <span style={{ color: "var(--muted)" }}>
                        ${r.costUsd.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {r.user} · {r.duration}s · {r.mode} · {r.aspectRatio} ·{" "}
                      {new Date(r.createdAt).toLocaleString("ja-JP")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        background: "var(--background)",
        border: "0.5px solid var(--border)",
        borderRadius: 12,
        padding: "1rem",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}
