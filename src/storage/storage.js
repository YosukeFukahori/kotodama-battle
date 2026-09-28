// セーブデータ（localStorage）の読み書き（docs/SPEC.md §3.5・§6・§7.2）。DOM に依存しない。
//
// - 戦績・履歴はモード（'cpu' / 将来 'ranked'）ごとに分けて持つ
// - CPU戦ではレーティングを一切変更しない（このモジュールは rating を書き換えない）
// - 途中離脱は「進行中フラグ（activeMatch）」で判定する：
//     バトル開始で立て、決着で記録と同時に下ろす。起動時に残っていれば敗北として1回だけ記録する
// - 保存先（storage）は getItem / setItem を持つものを注入できる（テストではメモリ上の実装を使う）

import { CONFIG } from '../config.js';

export const MODES = Object.freeze(['cpu', 'ranked']);
const OUTCOME_FIELD = Object.freeze({ win: 'wins', lose: 'losses', draw: 'draws' });

function emptyRecord() {
  return { wins: 0, losses: 0, draws: 0 };
}

export function createDefaultSave() {
  return {
    version: CONFIG.storage.schemaVersion,
    rating: { ranked: null },
    record: { cpu: emptyRecord(), ranked: emptyRecord() },
    history: { cpu: [], ranked: [] },
    activeMatch: null,
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

function normalizeRecord(raw) {
  return { wins: count(raw?.wins), losses: count(raw?.losses), draws: count(raw?.draws) };
}

function isHistoryEntry(e) {
  return Boolean(e) && typeof e.at === 'string' && e.outcome in OUTCOME_FIELD;
}

function normalizeActiveMatch(raw) {
  if (!raw || !MODES.includes(raw.mode)) return null;
  return {
    mode: raw.mode,
    cpuId: typeof raw.cpuId === 'string' ? raw.cpuId : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
    round: count(raw.round),
  };
}

/** 読み込んだデータを検証し、壊れている項目は既定値で補う。 */
export function normalizeSave(raw, historyLimit = CONFIG.storage.historyLimit) {
  const save = createDefaultSave();
  if (!raw || typeof raw !== 'object') return save;
  // 将来 schemaVersion を上げるときは、ここで旧形式から変換する

  const ranked = raw.rating?.ranked;
  save.rating.ranked = typeof ranked === 'number' && Number.isFinite(ranked) ? ranked : null;
  for (const mode of MODES) {
    save.record[mode] = normalizeRecord(raw.record?.[mode]);
    const list = raw.history?.[mode];
    save.history[mode] = Array.isArray(list) ? list.filter(isHistoryEntry).slice(0, historyLimit) : [];
  }
  save.activeMatch = normalizeActiveMatch(raw.activeMatch);
  return save;
}

/** 勝率（勝ち ÷ 全試合。引き分けを含む）。0試合なら null。 */
export function winRate(record) {
  const total = record.wins + record.losses + record.draws;
  return total === 0 ? null : record.wins / total;
}

export class SaveStore {
  #storage;
  #key;
  #historyLimit;
  #now;
  #memory = null; // storage が使えないときの退避先

  /**
   * @param {{
   *   storage: { getItem(key: string): string | null, setItem(key: string, value: string): void } | null,
   *   key?: string, historyLimit?: number, now?: () => Date,
   * }} options
   */
  constructor({ storage, key = CONFIG.storage.key, historyLimit = CONFIG.storage.historyLimit, now = () => new Date() }) {
    this.#storage = storage;
    this.#key = key;
    this.#historyLimit = historyLimit;
    this.#now = now;
  }

  /** 現在のセーブデータ（コピー）。 */
  load() {
    let text = null;
    try {
      text = this.#storage?.getItem(this.#key) ?? null;
    } catch {
      text = null;
    }
    if (text == null) return this.#memory ? clone(this.#memory) : createDefaultSave();
    try {
      return normalizeSave(JSON.parse(text), this.#historyLimit);
    } catch {
      return createDefaultSave();
    }
  }

  #write(save) {
    this.#memory = clone(save);
    try {
      this.#storage?.setItem(this.#key, JSON.stringify(save));
    } catch {
      // 容量超過・プライベートモードなど。メモリ上の値で続行する
    }
  }

  /** バトル開始：進行中フラグを立てる。 */
  beginMatch({ mode, cpuId = null }) {
    if (!MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
    const save = this.load();
    save.activeMatch = { mode, cpuId, startedAt: this.#now().toISOString(), round: 0 };
    this.#write(save);
  }

  /** 各問の開始：進行中フラグの問題番号を更新する。 */
  setActiveRound(round) {
    const save = this.load();
    if (!save.activeMatch) return;
    save.activeMatch.round = count(round);
    this.#write(save);
  }

  /**
   * 決着：戦績と履歴に記録し、進行中フラグを下ろす（1回の保存で行う）。
   * 進行中フラグがなければ何もしない（二重記録の防止）。
   * @param {{ outcome: 'win' | 'lose' | 'draw', reason: string, rounds: number }} result
   * @returns 記録した履歴エントリ。記録しなかった場合は null
   */
  finishMatch({ outcome, reason, rounds }) {
    const save = this.load();
    if (!save.activeMatch) return null;
    const entry = this.#record(save, save.activeMatch, { outcome, reason, rounds });
    save.activeMatch = null;
    this.#write(save);
    return entry;
  }

  /**
   * 起動時：前回の進行中フラグが残っていれば、途中離脱の敗北として1回だけ記録して下ろす。
   * @returns 記録した履歴エントリ。なければ null
   */
  recoverAbandonedMatch() {
    const save = this.load();
    const match = save.activeMatch;
    if (!match) return null;
    const entry = this.#record(save, match, { outcome: 'lose', reason: 'abandon', rounds: match.round });
    save.activeMatch = null;
    this.#write(save);
    return entry;
  }

  #record(save, match, { outcome, reason, rounds }) {
    const field = OUTCOME_FIELD[outcome];
    if (!field) throw new Error(`Unknown outcome: ${outcome}`);
    const entry = {
      at: this.#now().toISOString(),
      mode: match.mode,
      cpuId: match.cpuId,
      outcome,
      reason,
      rounds: count(rounds),
    };
    save.record[match.mode][field] += 1;
    save.history[match.mode] = [entry, ...save.history[match.mode]].slice(0, this.#historyLimit);
    return entry;
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // アクセス自体が禁止されている環境
  }
}

let shared = null;

/** アプリ全体で使うセーブデータ（localStorage）。 */
export function getStore() {
  shared ??= new SaveStore({ storage: browserStorage() });
  return shared;
}
