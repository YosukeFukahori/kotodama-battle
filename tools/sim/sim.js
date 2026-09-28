// バランス調整用のシミュレーター（開発用。ゲーム本体からは使わない）。
// ゲーム本体と同じロジック（出題・判定・攻撃・CPU）を使い、タイマーなしで対戦を大量に回して集計する。
//
// ブラウザで http://localhost:8000/tools/sim/ を開く。
// プレイヤー側は「人間のモデル」（考える時間・入力速度・狙う文字数・ミス率）で回答する。
// モデルの回答は公式辞書から選ぶ（人間が知っている語より広いので、やや強めに出る）。

import { CONFIG } from '../../src/config.js';
import { CPU_LIST } from '../../src/cpu/enemies.js';
import { planCpuAnswer, pickWord } from '../../src/cpu/cpuAI.js';
import { createBattle, resolveRound } from '../../src/core/battle.js';
import { judgeAnswer } from '../../src/core/judge.js';
import { readingLength } from '../../src/core/kana.js';
import { normal } from '../../src/core/random.js';
import { createDictionaries, loadPromptPool } from '../../src/dictionary/setup.js';
import { chunkFileName } from '../../src/dictionary/officialDictionary.js';
import { toWordEntry } from '../../src/dictionary/wordEntry.js';

/** 人間のプレイヤーのモデル。回答時間 ＝ 考える時間 ＋ (探す時間 ＋ 入力時間) × 文字数 */
export const PLAYER_MODELS = {
  casual: {
    label: 'ふつうの人',
    thinkSec: { mean: 4.5, sd: 1.8, min: 1.8 },
    secPerChar: 0.65, // 長い言葉ほど思いつくのにも入力にも時間がかかる
    wordLength: { mean: 5, sd: 1.5 },
    timeoutRate: 0.05,
    invalidRate: 0.07,
  },
  quick: {
    label: '即答型（短い言葉をすぐ出す）',
    thinkSec: { mean: 2.8, sd: 0.8, min: 1.2 },
    secPerChar: 0.6,
    wordLength: { mean: 3, sd: 0.6 },
    timeoutRate: 0.03,
    invalidRate: 0.05,
  },
  long: {
    label: '長文型（時間を使って長い言葉を出す）',
    thinkSec: { mean: 4.5, sd: 1.8, min: 2.0 },
    secPerChar: 0.7,
    wordLength: { mean: 11, sd: 2.5 },
    timeoutRate: 0.05,
    invalidRate: 0.08,
  },
};

const timeLimitMs = CONFIG.battle.timeLimitSec * 1000;
const OFFICIAL_DIR = new URL('../../data/official/', import.meta.url);
const chunkCache = new Map();

async function officialWords(prompt) {
  const key = `${prompt.first}|${prompt.last}`;
  if (!chunkCache.has(key)) {
    const res = await fetch(new URL(chunkFileName(prompt.first, prompt.last), OFFICIAL_DIR));
    chunkCache.set(key, res.ok ? (await res.json()).entries.map(toWordEntry) : []);
  }
  return chunkCache.get(key);
}

function planPlayer(model, words, prompt, random) {
  if (words.length === 0 || random() < model.timeoutRate) return { status: 'timeout' };
  const word = pickWord(words, model.wordLength, { random });
  const think = Math.max(model.thinkSec.min, normal(random, model.thinkSec.mean, model.thinkSec.sd));
  const timeMs = Math.round((think + model.secPerChar * readingLength(word.reading)) * 1000);
  if (timeMs >= timeLimitMs) return { status: 'timeout' };
  // 無効回答（辞書にない言葉を出してしまう）
  const input = random() < model.invalidRate ? `${prompt.first}ぬぬぬ${prompt.last}` : word.reading;
  return { status: 'answered', input, timeMs };
}

function emptySide() {
  return { rounds: 0, answered: 0, timeouts: 0, invalid: 0, attacks: 0, damage: 0, lengthSum: 0, timeSum: 0, firstStrikes: 0 };
}

/**
 * 対戦を回して集計する。
 * @param {{ player: object, opponent: { kind: 'cpu', cpu: object } | { kind: 'model', model: object }, matches: number }} options
 */
export async function simulate({ player, opponent, matches = 100, random = Math.random, damageParams = CONFIG.damage, cpuOverride = null }) {
  const data = createDictionaries();
  const pool = await loadPromptPool();
  const result = {
    matches, wins: 0, losses: 0, draws: 0, rounds: 0, sameWord: 0, bothAnswered: 0,
    cpuWords: new Map(), reasons: {}, side: { player: emptySide(), opponent: emptySide() },
  };

  for (let m = 0; m < matches; m += 1) {
    let battle = createBattle({ maxHp: CONFIG.battle.maxHp, drawAfterNoAttackRounds: CONFIG.battle.drawAfterNoAttackRounds });
    let last = null;
    const cpuUsed = new Set();
    while (!battle.result && battle.round < 80) {
      const prompt = pool.next({ avoid: last, random });
      last = prompt;
      await data.official.preload(prompt);
      const words = await officialWords(prompt);

      const plans = {
        player: planPlayer(player, words, prompt, random),
        opponent: opponent.kind === 'cpu'
          ? planCpuAnswer(cpuOverride ?? opponent.cpu, pool.candidates(prompt), { timeLimitMs, random, avoid: cpuUsed })
          : planPlayer(opponent.model, words, prompt, random),
      };
      if (opponent.kind === 'cpu' && plans.opponent.status === 'answered') {
        cpuUsed.add(plans.opponent.input);
        const key = `${prompt.first}|${prompt.last}`;
        if (!result.cpuWords.has(key)) result.cpuWords.set(key, new Set());
        result.cpuWords.get(key).add(plans.opponent.input);
      }

      const judged = {
        player: await judgeAnswer(data.validator, plans.player, prompt),
        opponent: await judgeAnswer(data.validator, plans.opponent, prompt),
      };
      const out = resolveRound(battle, judged, { timeLimitMs, damageParams });
      battle = out.state;

      for (const side of ['player', 'opponent']) {
        const s = result.side[side];
        const j = judged[side];
        s.rounds += 1;
        if (j.status === 'timeout') s.timeouts += 1;
        else {
          s.answered += 1;
          s.timeSum += j.timeMs;
          s.lengthSum += j.length;
          if (!j.valid) s.invalid += 1;
        }
      }
      for (const a of out.attacks) {
        result.side[a.attacker].attacks += 1;
        result.side[a.attacker].damage += a.damage;
      }
      if (out.order === 'sequential') result.side[out.attacks[0].attacker].firstStrikes += 1;
      if (judged.player.status === 'answered' && judged.opponent.status === 'answered') {
        result.bothAnswered += 1;
        if (judged.player.reading === judged.opponent.reading) result.sameWord += 1;
      }
    }
    result.rounds += battle.round;
    const { outcome, reason } = battle.result ?? { outcome: 'draw', reason: 'limit' };
    if (outcome === 'player') result.wins += 1;
    else if (outcome === 'opponent') result.losses += 1;
    else result.draws += 1;
    result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
  }
  return summarize(result);
}

function summarize(r) {
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const avg = (a, b) => (b ? Math.round((a / b) * 100) / 100 : 0);
  const side = (s) => ({
    timeoutRate: pct(s.timeouts, s.rounds),
    invalidRate: pct(s.invalid, s.answered),
    avgLength: avg(s.lengthSum, s.answered),
    avgTimeSec: avg(s.timeSum / 1000, s.answered),
    avgDamagePerHit: avg(s.damage, s.attacks),
    avgDamagePerMatch: avg(s.damage, r.matches),
    firstStrikeRate: pct(s.firstStrikes, s.rounds),
  });
  let variety = 0;
  let varietyN = 0;
  for (const set of r.cpuWords.values()) { variety += set.size; varietyN += 1; }
  return {
    matches: r.matches,
    playerWinRate: pct(r.wins, r.matches),
    opponentWinRate: pct(r.losses, r.matches),
    drawRate: pct(r.draws, r.matches),
    avgRounds: avg(r.rounds, r.matches),
    sameWordRate: pct(r.sameWord, r.bothAnswered),
    cpuWordsPerPrompt: varietyN ? avg(variety, varietyN) : null,
    reasons: r.reasons,
    player: side(r.side.player),
    opponent: side(r.side.opponent),
  };
}

/** 各難易度 × プレイヤーモデル と、プレイヤーモデル同士の対戦をまとめて回す。 */
export async function runAll({ matches = 100 } = {}) {
  const out = { vsCpu: {}, strategy: {} };
  for (const cpu of CPU_LIST) {
    for (const [id, model] of Object.entries(PLAYER_MODELS)) {
      out.vsCpu[`${cpu.id} vs ${id}`] = await simulate({ player: model, opponent: { kind: 'cpu', cpu }, matches });
    }
  }
  out.strategy['quick vs long'] = await simulate({ player: PLAYER_MODELS.quick, opponent: { kind: 'model', model: PLAYER_MODELS.long }, matches });
  out.strategy['casual vs casual'] = await simulate({ player: PLAYER_MODELS.casual, opponent: { kind: 'model', model: PLAYER_MODELS.casual }, matches });
  return out;
}
