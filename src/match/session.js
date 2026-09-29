// 対戦セッションの共通部分（docs/SPEC.md §3, §10）。
//
// バトル画面はセッションから届く「出来事（イベント）」を表示し、回答をセッションに渡すだけにする。
// 対戦モードごとの進行（CPU戦・フレンド戦・将来の Ranked 戦）はセッションの中に閉じ込める。
//
// ■ セッションが持つもの
//   mode            'cpu' | 'friend' | 'ranked'
//   labels          { title, player, opponent, opponentShort }   画面に出す名前
//   maxHp, timeLimitMs, timing
//   requiresStartButton   true なら画面が説明とスタートボタンを出し、押されたら start() を呼ぶ
//   prepare()       → Promise<boolean>  開始前の準備（辞書の読み込みなど）
//   start()         対戦開始
//   submitAnswer(input) → boolean       回答（回答時間はセッションが計測する）
//   finished        決着済みか（true のとき forfeit() は結果へ進むだけ）
//   forfeit()       やめる
//   dispose()       画面を離れるときの後片付け
//
// ■ イベント（emit で画面へ届く。時刻はすべて performance.now() 基準のミリ秒）
//   { type: 'round', roundNo }                              ROUND 表示（お題は伏せる・入力不可）
//   { type: 'ready' }                                       READY 表示
//   { type: 'fight', prompt, startedAt, timeLimitMs }       FIGHT!：お題表示・入力受付開始
//   { type: 'answerStatus', side, status }                  side: 'player'|'opponent'、status: 'answered'|'timeout'
//   { type: 'judging' }                                     判定中
//   { type: 'result', judged, outcome, hp, noAttackStreak, drawAfter, finished, nextAt }
//                                                           判定タイム表示。nextAt に次へ進む
//   { type: 'end', outcome, reason, rounds, mode, ... }     決着・中止（outcome: 'win'|'lose'|'draw'|'aborted'）
//   { type: 'error', message, retry }                       準備に失敗（retry() でやり直し）
//   { type: 'connection', opponentConnected, waitUntil }    相手の接続状態（フレンド戦）
//
// judged / outcome / hp は常に「自分 = player、相手 = opponent」の視点で渡す。

export class BaseSession {
  #listeners = new Set();
  #timers = new Set();
  disposed = false;

  /** イベントを受け取る。戻り値の関数で解除する。 */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event) {
    if (this.disposed) return;
    for (const listener of this.#listeners) listener(event);
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this.#timers.delete(id);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.#timers.add(id);
    return id;
  }

  /** 指定時刻（performance.now() 基準）まで待つ。dispose されたら二度と解決しない。 */
  sleepUntil(at) {
    return new Promise((resolve) => this.later(resolve, at - performance.now()));
  }

  clearTimers() {
    for (const id of this.#timers) clearTimeout(id);
    this.#timers.clear();
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    this.#listeners.clear();
  }
}

/** 決着（battle.js の result）を自分視点の勝敗に変換する */
export const OUTCOME_FOR_PLAYER = Object.freeze({ player: 'win', opponent: 'lose', draw: 'draw' });
