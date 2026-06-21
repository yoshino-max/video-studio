/**
 * 予算ガードレール（簡易版）
 *
 * チーム全体の月次生成本数を管理する。
 * Vercelはサーバーレスのため、メモリ上のカウンターは揮発する可能性がある。
 * そのため /tmp に月次ファイルとして保存し、可能な限り永続化を試みる。
 * （完全な永続化が必要になったらVercel KVに差し替え可能な構造）
 */

import fs from "fs";
import path from "path";

const STORE_DIR = "/tmp/video-tool-budget";

export interface BudgetState {
  month: string; // "2026-05"
  totalCount: number; // 今月の累計生成本数
  totalCostUsd: number; // 今月の累計コスト（USD概算）
  records: GenerationRecord[];
}

export interface GenerationRecord {
  taskId: string;
  user: string;
  promptJa: string;
  duration: string;
  mode: string;
  aspectRatio: string;
  costUsd: number;
  createdAt: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function storePath(month: string): string {
  return path.join(STORE_DIR, `${month}.json`);
}

function ensureDir() {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
  } catch {
    // 書き込めない環境でも落とさない
  }
}

export function getBudgetState(): BudgetState {
  const month = currentMonth();
  ensureDir();
  try {
    const raw = fs.readFileSync(storePath(month), "utf8");
    const parsed = JSON.parse(raw) as BudgetState;
    if (parsed.month === month) return parsed;
  } catch {
    // ファイルなし or 読み込み失敗 → 新規
  }
  return { month, totalCount: 0, totalCostUsd: 0, records: [] };
}

function saveBudgetState(state: BudgetState) {
  ensureDir();
  try {
    fs.writeFileSync(storePath(state.month), JSON.stringify(state), "utf8");
  } catch {
    // 書き込み失敗は致命的ではない（メモリ上の値で動作継続）
  }
}

/** 環境変数から月次上限を取得（未設定なら制限なし扱い） */
export function getMonthlyLimit(): number {
  const v = process.env.TEAM_MONTHLY_LIMIT;
  if (!v) return Infinity;
  const n = parseInt(v, 10);
  return isNaN(n) ? Infinity : n;
}

/** 生成コストの概算（USD） */
export function estimateCost(duration: string, mode: string): number {
  const base = mode === "pro" ? 0.33 : 0.2;
  return duration === "10" ? Math.round(base * 1.8 * 100) / 100 : base;
}

/**
 * 生成前チェック。上限超過なら allowed:false を返す。
 */
export function checkBudget(): {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
} {
  const state = getBudgetState();
  const limit = getMonthlyLimit();
  const used = state.totalCount;
  const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);

  if (limit !== Infinity && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      remaining: 0,
      reason: `今月のチーム生成上限（${limit}本）に達しました。来月までお待ちいただくか、管理者に上限引き上げを依頼してください。`,
    };
  }
  return { allowed: true, used, limit, remaining };
}

/**
 * 生成成功時に記録を追加。
 */
export function recordGeneration(record: GenerationRecord) {
  const state = getBudgetState();
  state.totalCount += 1;
  state.totalCostUsd = Math.round((state.totalCostUsd + record.costUsd) * 100) / 100;
  state.records.unshift(record);
  // recordsは直近100件のみ保持（メモリ節約）
  if (state.records.length > 100) {
    state.records = state.records.slice(0, 100);
  }
  saveBudgetState(state);
}
