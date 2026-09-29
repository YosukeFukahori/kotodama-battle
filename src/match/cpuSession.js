// CPU 戦のセッション（docs/SPEC.md §3・§4）。バトル画面から切り出した CPU 戦の進行。
// 審判（判定・攻撃・HP・決着）は自分の端末で行う。戦績は record.cpu にだけ記録する。

import { CONFIG } from '../config.js';
import { planCpuAnswer } from '../cpu/cpuAI.js';
import { createBattle, forfeit } from '../core/battle.js';
import { normalizeReading } from '../core/kana.js';
import { scheduleRound, delayFight, nextRoundAt } from '../core/roundSchedule.js';
import { getGameData } from '../dictionary/setup.js';
import { getStore } from '../storage/storage.js';
import { BaseSession, OUTCOME_FOR_PLAYER } from './session.js';
import { refereeRound } from './referee.js';

export class CpuSession extends BaseSession {
  mode = 'cpu';
  requiresStartButton = true;

  #cpu;
  #data;
  #store;
  #battle;
  #started = false;
  #phase = 'lobby'; // lobby | intro | answering | judging | revealed | finished
  #round = null;    // { prompt, startedAt, answers: { player, opponent } }
  #lastPrompt = null;
  #decidedRound = 0;
  #cpuUsedWords = new Set();

  constructor({ cpu, data = getGameData(), store = getStore(), config = CONFIG }) {
    super();
    this.#cpu = cpu;
    this.#data = data;
    this.#store = store;
    this.cpuId = cpu.id;
    this.maxHp = config.battle.maxHp;
    this.timeLimitMs = config.battle.timeLimitSec * 1000;
    this.timing = config.battle.timing;
    this.drawAfter = config.battle.drawAfterNoAttackRounds;
    this.labels = {
      title: `CPU：${cpu.label}`,
      player: 'あなた',
      opponent: `CPU（${cpu.label}）`,
      opponentHp: cpu.label,
      opponentShort: 'CPU',
    };
    this.#battle = createBattle({ maxHp: this.maxHp, drawAfterNoAttackRounds: this.drawAfter });
  }

  get started() {
    return this.#started;
  }

  /** 決着済みか（判定タイム表示中に決着が決まっている場合も含む） */
  get finished() {
    return Boolean(this.#battle.result);
  }

  async #prepareData() {
    try {
      const pool = await this.#data.promptPool;
      await this.#data.extra.preload();
      return pool;
    } catch {
      return null;
    }
  }

  /** 開始前の準備（出題用プールと追加辞書の読み込み）。 */
  async prepare() {
    return Boolean(await this.#prepareData());
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    // ここからがバトル開始。以降の離脱（リロード・閉じる）は次回起動時に敗北として記録される
    this.#store.beginMatch({ mode: 'cpu', cpuId: this.#cpu.id });
    this.#startRound();
  }

  /** お題を決め、判定に必要な辞書データを読み込む。失敗したら null。 */
  async #preparePrompt() {
    const pool = await this.#prepareData();
    const prompt = pool?.next({ avoid: this.#lastPrompt });
    if (!prompt) return null;
    const ok = await this.#data.official.preload(prompt).then(() => true, () => false);
    return ok ? { pool, prompt } : null;
  }

  async #startRound() {
    this.#phase = 'intro';
    this.clearTimers();
    this.#round = null;
    const roundNo = this.#battle.round + 1;
    this.#store.setActiveRound(roundNo);

    const schedule = scheduleRound(performance.now(), this.timing, this.timeLimitMs);
    const preparing = this.#preparePrompt(); // ROUND / READY の間に裏で準備する（画面には出さない）

    this.emit({ type: 'round', roundNo });
    await this.sleepUntil(schedule.readyAt);
    this.emit({ type: 'ready' });

    const prepared = await preparing;
    await this.sleepUntil(schedule.fightAt);
    if (this.disposed) return;
    if (!prepared) {
      this.emit({ type: 'error', message: '辞書を読み込めませんでした', retry: () => this.#startRound() });
      return;
    }
    // 読み込みが READY に間に合わなかった場合は、その分だけ FIGHT を遅らせる
    this.#beginAnswering(prepared, delayFight(schedule, performance.now(), this.timeLimitMs, this.timing));
  }

  /** FIGHT!：お題表示・入力可・タイマー開始・CPU回答タイマー開始を同時に行う */
  #beginAnswering({ pool, prompt }, schedule) {
    this.#lastPrompt = prompt;
    const cpuPlan = planCpuAnswer(this.#cpu, pool.candidates(prompt), { timeLimitMs: this.timeLimitMs, avoid: this.#cpuUsedWords });
    if (cpuPlan.status === 'answered') this.#cpuUsedWords.add(cpuPlan.input);

    this.#round = { prompt, answers: { player: null, opponent: null }, startedAt: performance.now() };
    this.#phase = 'answering';
    this.emit({ type: 'fight', prompt, startedAt: this.#round.startedAt, timeLimitMs: this.timeLimitMs, fightMs: schedule.fightEndAt - schedule.fightAt });

    if (cpuPlan.status === 'answered') {
      this.later(() => {
        if (this.#phase !== 'answering') return;
        this.#round.answers.opponent = cpuPlan;
        this.emit({ type: 'answerStatus', side: 'opponent', status: 'answered' });
        this.#checkAllAnswered();
      }, cpuPlan.timeMs);
    }
    // タブが裏にあっても締め切れるよう setTimeout で管理する
    this.later(() => this.#closeAnswering(), this.timeLimitMs);
  }

  submitAnswer(value) {
    if (this.#phase !== 'answering' || this.#round.answers.player) return false;
    if (normalizeReading(value) === '') return false;
    const timeMs = Math.round(performance.now() - this.#round.startedAt);
    if (timeMs >= this.timeLimitMs) return false; // 締め切り処理に任せる
    this.#round.answers.player = { status: 'answered', input: value, timeMs };
    this.emit({ type: 'answerStatus', side: 'player', status: 'answered' });
    this.#checkAllAnswered();
    return true;
  }

  #checkAllAnswered() {
    if (this.#round.answers.player && this.#round.answers.opponent) this.#closeAnswering();
  }

  /** 回答受付を締め切る。未回答の側は時間切れ。 */
  async #closeAnswering() {
    if (this.#phase !== 'answering') return;
    this.clearTimers();
    this.#phase = 'judging';
    for (const side of ['player', 'opponent']) {
      if (!this.#round.answers[side]) {
        this.#round.answers[side] = { status: 'timeout' };
        this.emit({ type: 'answerStatus', side, status: 'timeout' });
      }
    }
    this.emit({ type: 'judging' });

    // 審判（CPU戦では自分の端末）
    const { judged, resolution, state, finished } = await refereeRound({
      validator: this.#data.validator,
      state: this.#battle,
      prompt: this.#round.prompt,
      answers: this.#round.answers,
      timeLimitMs: this.timeLimitMs,
    });
    if (this.disposed) return;
    this.#battle = state;
    if (finished) {
      // 決着した瞬間に記録する（結果表示中に離脱しても敗北扱いにならないように）
      this.#decidedRound = this.#battle.round;
      this.#record();
    }
    this.#phase = finished ? 'finished' : 'revealed';

    // 判定タイムは固定時間表示し、自動で次へ進む（スキップなし）
    const revealAt = performance.now();
    const nextAt = nextRoundAt(revealAt, this.timing);
    this.emit({
      type: 'result',
      judged,
      outcome: resolution,
      hp: this.#battle.hp,
      noAttackStreak: this.#battle.noAttackStreak,
      drawAfter: this.#battle.drawAfterNoAttackRounds,
      finished,
      nextAt,
    });
    this.later(() => {
      if (finished) this.#emitEnd();
      else this.#startRound();
    }, nextAt - revealAt);
  }

  #record() {
    const { outcome, reason } = this.#battle.result;
    this.#store.finishMatch({ outcome: OUTCOME_FOR_PLAYER[outcome], reason, rounds: this.#decidedRound });
  }

  #emitEnd() {
    const { outcome, reason } = this.#battle.result;
    this.emit({ type: 'end', mode: 'cpu', cpuId: this.#cpu.id, outcome: OUTCOME_FOR_PLAYER[outcome], reason, rounds: this.#decidedRound });
  }

  /** やめる（バトル開始後は負け）。 */
  forfeit() {
    if (!this.#started) return;
    if (this.#battle.result) {
      this.#emitEnd();
      return;
    }
    this.clearTimers();
    // 出題中・判定中なら、その問題で決着したことにする
    this.#decidedRound = ['intro', 'answering', 'judging'].includes(this.#phase) ? this.#battle.round + 1 : this.#battle.round;
    this.#phase = 'finished';
    this.#battle = forfeit(this.#battle, 'player');
    this.#record();
    this.#emitEnd();
  }
}
