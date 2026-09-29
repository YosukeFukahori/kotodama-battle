// フレンド戦のセッション（docs/SPEC.md §10）。通信は RoomStore 越し。
//
// ■ 両端末共通
//   部屋を購読し、ホストが書いた時刻表（サーバー時刻）を自分の時計に換算して
//   ROUND / READY / FIGHT! / 判定表示 / 次ラウンドのイベントを出す。
//   → 片方の操作や遅れで相手の進行タイミングが変わらない。
//   回答は自分の FIGHT! 時刻から計測して rounds/{n}/answers/{自分} に書く。
// ■ ホスト端末のみ（Ver.0.2 の審判役）
//   両者の回答が揃うか、締め切り＋猶予を過ぎたら referee.js で裁定し、
//   判定結果・状態・次ラウンドの時刻表とお題を1回で書き込む。
//   将来の Ranked 戦では、この役をサーバーに置き換える（同じ referee.js を使う）。
// ■ 切断
//   各端末は接続確認（lastSeen）を定期的に書く。相手の確認が途絶えたら接続待ちを表示し、
//   復帰待ち時間を過ぎたら試合中止（記録なし）。

import { normalizeReading } from '../core/kana.js';
import { getGameData } from '../dictionary/setup.js';
import { getStore } from '../storage/storage.js';
import { BaseSession } from './session.js';
import { refereeRound, sanitizeAnswer } from './referee.js';
import { roomPath, otherSide, buildRound, touch } from './friendRoom.js';
import { saveCurrentRoom } from './identity.js';

// ---------- host / guest ⇔ 自分視点の読み替え ----------

/** 部屋データの 'host' / 'guest' を、自分視点の 'player' / 'opponent' に */
export function viewSide(value, mySide) {
  if (value === 'host' || value === 'guest') return value === mySide ? 'player' : 'opponent';
  return value;
}

/** ホスト視点（host = player）の 'player' / 'opponent' を 'host' / 'guest' に */
function canonSide(value) {
  if (value === 'player') return 'host';
  if (value === 'opponent') return 'guest';
  return value;
}

export function pairToView(pair, mySide) {
  return mySide === 'host' ? { player: pair.host, opponent: pair.guest } : { player: pair.guest, opponent: pair.host };
}

function resolutionToCanon(res) {
  return {
    order: res.order,
    skipped: canonSide(res.skipped),
    attacks: res.attacks.map((a) => ({ ...a, attacker: canonSide(a.attacker), target: canonSide(a.target) })),
  };
}

export function resolutionToView(res, mySide) {
  return {
    order: res.order,
    skipped: viewSide(res.skipped ?? null, mySide),
    attacks: (res.attacks ?? []).map((a) => ({ ...a, attacker: viewSide(a.attacker, mySide), target: viewSide(a.target, mySide) })),
  };
}

/** 部屋の状態 → battle.js の状態（ホスト = player として審判する） */
function stateToBattle(state) {
  return {
    ...state,
    hp: { player: state.hp.host, opponent: state.hp.guest },
    result: state.result ? { ...state.result, outcome: state.result.outcome === 'host' ? 'player' : state.result.outcome === 'guest' ? 'opponent' : 'draw' } : null,
  };
}

function battleToState(battle) {
  return {
    maxHp: battle.maxHp,
    drawAfterNoAttackRounds: battle.drawAfterNoAttackRounds,
    hp: { host: battle.hp.player, guest: battle.hp.opponent },
    round: battle.round,
    noAttackStreak: battle.noAttackStreak,
    result: battle.result ? { outcome: canonSide(battle.result.outcome), reason: battle.result.reason } : null,
  };
}

/** 決着（host / guest / draw）を自分の勝敗に */
function outcomeFor(canonOutcome, mySide) {
  if (canonOutcome === 'draw') return 'draw';
  return canonOutcome === mySide ? 'win' : 'lose';
}

export class FriendSession extends BaseSession {
  mode = 'friend';
  requiresStartButton = false;

  #store;
  #code;
  #side;
  #data;
  #storage;
  #rules;
  #room = null;
  #unsubscribe = null;
  #pool = null;
  #ended = false;
  #finished = false;
  #scheduled = new Set();   // 時刻表を組んだラウンド
  #resultShown = new Set(); // 判定を表示したラウンド
  #judging = new Set();     // ホストが裁定中・裁定済みのラウンド
  #closeTimers = new Set(); // ホストが締め切りタイマーを仕掛けたラウンド
  #current = null;          // 今のラウンド { n, prompt, fightLocal, deadlineLocal, answered, oppAnswered, closed }
  #opponentConnected = true;
  #stopPresence = null;

  /**
   * @param {{ store, code: string, side: 'host'|'guest', room: object, data?, storage? }} options
   *   room：開始時点の部屋データ（名前・ルールに使う）
   */
  constructor({ store, code, side, room, data = getGameData(), storage = getStore() }) {
    super();
    this.#store = store;
    this.#code = code;
    this.#side = side;
    this.#data = data;
    this.#storage = storage;
    this.#rules = room.meta.rules;
    this.maxHp = this.#rules.maxHp;
    this.timeLimitMs = this.#rules.timeLimitMs;
    this.timing = this.#rules.timing;
    this.code = code;
    this.side = side;
    const opponentName = room.players?.[otherSide(side)]?.name ?? '相手';
    this.opponentName = opponentName;
    this.labels = {
      title: `フレンド戦 #${code}`,
      player: 'あなた',
      opponent: opponentName,
      opponentHp: opponentName,
      opponentShort: opponentName,
    };
  }

  get finished() {
    return this.#finished;
  }

  async prepare() {
    return true;
  }

  get #path() {
    return roomPath(this.#code);
  }

  /** サーバー時刻 → この端末の performance.now() 基準 */
  #toLocal(serverAt) {
    return performance.now() + (serverAt - this.#store.serverNow());
  }

  async start() {
    saveCurrentRoom({ code: this.#code, side: this.#side });
    this.#storage.beginMatch({ mode: 'friend', opponentName: this.opponentName });
    if (this.#side === 'host') this.#pool = await this.#data.promptPool;
    if (this.disposed) return;
    this.#stopPresence = this.#store.trackPresence?.(`${this.#path}/players/${this.#side}`) ?? null;
    this.#heartbeat();
    this.#watchConnection();
    this.#unsubscribe = this.#store.subscribe(this.#path, (room) => this.#onRoom(room));
  }

  dispose() {
    this.#unsubscribe?.();
    this.#stopPresence?.();
    super.dispose();
  }

  // ---------- 接続確認 ----------

  #heartbeat() {
    if (this.#ended) return;
    touch(this.#store, this.#code, this.#side);
    this.later(() => this.#heartbeat(), this.#rules.friend.heartbeatMs);
  }

  #watchConnection() {
    if (this.#ended) return;
    const room = this.#room;
    const opp = room?.players?.[otherSide(this.#side)];
    if (opp && room.match?.status === 'playing') {
      const { disconnectAfterMs, reconnectWaitMs } = this.#rules.friend;
      const now = this.#store.serverNow();
      // 切断の判断：Firebase の onDisconnect による connected === false（即時）か、接続確認（lastSeen）の途絶
      const lostAt = opp.connected === false ? Math.min(opp.lastSeen, now) : opp.lastSeen + disconnectAfterMs;
      const connected = now < lostAt;
      const waitUntil = this.#toLocal(lostAt + reconnectWaitMs);
      if (!connected || connected !== this.#opponentConnected) {
        // 切断中は残り時間の表示を毎秒更新する
        this.emit({ type: 'connection', opponentConnected: connected, waitUntil });
      }
      this.#opponentConnected = connected;
      if (!connected && now - lostAt > reconnectWaitMs) {
        this.#store.update(this.#path, { 'match/status': 'aborted', 'meta/status': 'aborted' });
        this.#finishAborted();
        return;
      }
    }
    this.later(() => this.#watchConnection(), 1000);
  }

  // ---------- 部屋の変化 ----------

  #onRoom(room) {
    if (this.#ended) return;
    this.#room = room;
    const match = room?.match;
    if (!room || room.meta?.status === 'closed') {
      this.#finishAborted();
      return;
    }
    if (!match) return;
    if (match.status === 'aborted') {
      this.#finishAborted();
      return;
    }
    if (match.result?.reason === 'forfeit') {
      this.#finishFromMatch(match);
      return;
    }

    // 表示中のラウンドと、これから始まるラウンド（判定と同時に次のラウンドが書かれるため2つ見る）
    for (const n of [match.round - 1, match.round]) {
      const round = room.rounds?.[n];
      if (round) this.#scheduleRound(n, round);
    }

    const cur = this.#current;
    if (cur) {
      const round = room.rounds?.[cur.n];
      if (round?.answers?.[otherSide(this.#side)] && !cur.oppAnswered) {
        cur.oppAnswered = true;
        this.emit({ type: 'answerStatus', side: 'opponent', status: 'answered' });
      }
      if (round?.answers?.[this.#side] && !cur.answered) {
        // 再読み込みからの復帰：送信済みの回答
        cur.answered = true;
        this.emit({ type: 'answerStatus', side: 'player', status: 'answered' });
      }
      if (cur.answered && cur.oppAnswered) this.#emitJudging(cur);
      if (round?.result) this.#scheduleResult(cur.n, round.result, match);
    }

    if (this.#side === 'host') this.#hostCheck(room);
  }

  /** ラウンドの時刻表どおりにイベントを出す（すでに過ぎた段階は飛ばす） */
  #scheduleRound(n, round) {
    if (this.#scheduled.has(n)) return;
    const { schedule, prompt } = round;
    const serverNow = this.#store.serverNow();
    if (round.result && round.result.nextRoundAt <= serverNow) return; // もう終わったラウンド（復帰時）
    this.#scheduled.add(n);
    if (this.#side === 'host') this.#data.official.preload(prompt).catch(() => {});

    const at = (serverAt) => this.#toLocal(serverAt) - performance.now();
    if (serverNow < schedule.fightAt) {
      this.later(() => this.emit({ type: 'round', roundNo: n }), at(schedule.roundAt));
      this.later(() => this.emit({ type: 'ready' }), at(schedule.readyAt));
    }
    if (serverNow < schedule.deadlineAt) {
      this.later(() => this.#beginAnswering(n, round), at(schedule.fightAt));
      this.later(() => this.#onDeadline(n), at(schedule.deadlineAt));
    }
  }

  #beginAnswering(n, round) {
    const { schedule, prompt } = round;
    this.#current = {
      n,
      prompt,
      fightLocal: this.#toLocal(schedule.fightAt),
      deadlineLocal: this.#toLocal(schedule.deadlineAt),
      answered: false,
      oppAnswered: false,
      closed: false,
    };
    this.emit({
      type: 'fight',
      prompt,
      startedAt: this.#current.fightLocal,
      timeLimitMs: this.timeLimitMs,
      fightMs: schedule.fightEndAt - schedule.fightAt,
    });
    if (this.#room) this.#onRoom(this.#room); // 復帰時：送信済みの回答・相手の回答を反映
  }

  submitAnswer(value) {
    const cur = this.#current;
    if (!cur || cur.answered || cur.closed || this.#finished) return false;
    if (normalizeReading(value) === '') return false;
    const now = performance.now();
    if (now >= cur.deadlineLocal) return false;
    cur.answered = true;
    const answer = { status: 'answered', input: value, timeMs: Math.round(now - cur.fightLocal), submittedAt: this.#store.serverNow() };
    this.#store.set(`${this.#path}/rounds/${cur.n}/answers/${this.#side}`, answer);
    this.emit({ type: 'answerStatus', side: 'player', status: 'answered' });
    if (cur.oppAnswered) this.#emitJudging(cur);
    return true;
  }

  #onDeadline(n) {
    const cur = this.#current;
    if (!cur || cur.n !== n) return;
    this.#emitJudging(cur);
  }

  /** 回答受付の終了（未回答の側は時間切れ）→ 判定中 */
  #emitJudging(cur) {
    if (cur.closed) return;
    cur.closed = true;
    if (!cur.answered) this.emit({ type: 'answerStatus', side: 'player', status: 'timeout' });
    if (!cur.oppAnswered) this.emit({ type: 'answerStatus', side: 'opponent', status: 'timeout' });
    this.emit({ type: 'judging' });
  }

  /** 判定をホストが決めた時刻に表示し、次へ進む時刻を渡す */
  #scheduleResult(n, result, match) {
    if (this.#resultShown.has(n)) return;
    this.#resultShown.add(n);
    const revealIn = this.#toLocal(result.revealAt) - performance.now();
    this.later(() => {
      const cur = this.#current;
      if (cur && cur.n === n) this.#emitJudging(cur);
      this.emit({
        type: 'result',
        judged: pairToView(result.judged, this.#side),
        outcome: resolutionToView(result.resolution, this.#side),
        hp: pairToView(result.hp, this.#side),
        noAttackStreak: result.noAttackStreak,
        drawAfter: this.#rules.drawAfter,
        finished: result.finished,
        nextAt: this.#toLocal(result.nextRoundAt),
      });
      if (result.finished) {
        this.#finished = true;
        this.later(() => this.#finishFromMatch(this.#room?.match ?? match), this.#toLocal(result.nextRoundAt) - performance.now());
      }
    }, revealIn);
  }

  // ---------- ホスト（審判役） ----------

  #hostCheck(room) {
    const match = room.match;
    if (match.status !== 'playing') return;
    const n = match.round;
    const round = room.rounds?.[n];
    if (!round || round.result || this.#judging.has(n)) return;
    const { answerGraceMs } = this.#rules.friend;
    const bothAnswered = round.answers?.host && round.answers?.guest;
    const closeAt = round.schedule.deadlineAt + answerGraceMs;
    if (bothAnswered || this.#store.serverNow() >= closeAt) {
      this.#hostJudge(n, round, match);
    } else if (!this.#closeTimers.has(n)) {
      this.#closeTimers.add(n);
      this.later(() => this.#room && this.#hostCheck(this.#room), this.#toLocal(closeAt) - performance.now() + 20);
    }
  }

  async #hostJudge(n, round, match) {
    this.#judging.add(n);
    const { answerGraceMs, revealDelayMs } = this.#rules.friend;
    const accept = (a) => (a && a.submittedAt <= round.schedule.deadlineAt + answerGraceMs
      ? sanitizeAnswer(a, { timeLimitMs: this.timeLimitMs })
      : { status: 'timeout' });
    await this.#data.official.preload(round.prompt).catch(() => {});
    const { judged, resolution, state, finished } = await refereeRound({
      validator: this.#data.validator,
      state: stateToBattle(match.state),
      prompt: round.prompt,
      answers: { player: accept(round.answers?.host), opponent: accept(round.answers?.guest) },
      timeLimitMs: this.timeLimitMs,
    });
    if (this.disposed || this.#room?.match?.status !== 'playing') return;

    const revealAt = this.#store.serverNow() + revealDelayMs;
    const nextRoundAt = revealAt + this.timing.revealMs;
    const canonState = battleToState(state);
    const updates = {
      [`rounds/${n}/result`]: {
        judged: { host: judged.player, guest: judged.opponent },
        resolution: resolutionToCanon(resolution),
        hp: { ...canonState.hp },
        noAttackStreak: canonState.noAttackStreak,
        finished,
        revealAt,
        nextRoundAt,
      },
      'match/state': canonState,
    };
    if (finished) {
      updates['match/status'] = 'finished';
      updates['match/result'] = { ...canonState.result, decidedRound: canonState.round };
      updates['meta/status'] = 'finished';
    } else {
      updates[`rounds/${n + 1}`] = buildRound(this.#pool, this.#rules, nextRoundAt, round.prompt);
      updates['match/round'] = n + 1;
    }
    await this.#store.update(this.#path, updates);
  }

  // ---------- 終了 ----------

  forfeit() {
    if (this.#ended) return;
    const match = this.#room?.match;
    if (this.#finished || !match || match.status !== 'playing') {
      if (match?.result) this.#finishFromMatch(match);
      return;
    }
    const result = { outcome: otherSide(this.#side), reason: 'forfeit', decidedRound: match.round };
    this.#store.update(this.#path, { 'match/status': 'finished', 'match/result': result, 'meta/status': 'finished' });
    this.#finishFromMatch({ ...match, result });
  }

  #finishFromMatch(match) {
    if (this.#ended || !match?.result) return;
    this.#ended = true;
    this.#finished = true;
    this.clearTimers();
    const { outcome, reason, decidedRound } = match.result;
    const mine = outcomeFor(outcome, this.#side);
    this.#storage.finishMatch({ outcome: mine, reason, rounds: decidedRound });
    saveCurrentRoom(null);
    this.emit({ type: 'end', mode: 'friend', outcome: mine, reason, rounds: decidedRound, opponentName: this.opponentName, code: this.#code });
  }

  #finishAborted() {
    if (this.#ended) return;
    this.#ended = true;
    this.#finished = true;
    this.clearTimers();
    this.#storage.cancelMatch();
    saveCurrentRoom(null);
    this.emit({ type: 'end', mode: 'friend', outcome: 'aborted', reason: 'disconnect', rounds: this.#current?.n ?? 0, opponentName: this.opponentName, code: this.#code });
  }
}
