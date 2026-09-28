// バトルの状態と、判定タイム後の攻撃処理（docs/SPEC.md §3.1〜3.3）。DOM・タイマーに依存しない。
//
// 両者は 'player'（自分）と 'opponent'（相手）で表す。CPU 戦でも将来の対人戦でも同じ。
// 状態は変更せず、毎回新しい状態を返す。

import { CONFIG } from '../config.js';
import { calcDamage, damageLength } from './damage.js';

export const SIDES = Object.freeze(['player', 'opponent']);

export function otherSide(side) {
  return side === 'player' ? 'opponent' : 'player';
}

/**
 * @param {{ maxHp: number, drawAfterNoAttackRounds: number }} options
 */
export function createBattle({ maxHp, drawAfterNoAttackRounds }) {
  return Object.freeze({
    maxHp,
    drawAfterNoAttackRounds,
    hp: Object.freeze({ player: maxHp, opponent: maxHp }),
    round: 0,
    noAttackStreak: 0,
    result: null, // 決着したら { outcome: 'player' | 'opponent' | 'draw', reason }
  });
}

function isValid(answer) {
  return answer?.status === 'answered' && answer.valid === true;
}

/**
 * 1問分の判定済み回答から攻撃を処理する。
 *
 * - 有効回答だけが攻撃する
 * - 両者有効：回答時間の短い側が先攻。先攻の攻撃で相手HPが0なら後攻の攻撃はなし
 * - 回答時間が完全に同じ：同時攻撃（両者のダメージを同時に適用）
 * - どちらからも攻撃がなければ無攻撃カウント +1。規定数に達したら引き分け
 *
 * @param {object} state createBattle / resolveRound の戻り値
 * @param {{ player: object, opponent: object }} answers judgeAnswer の戻り値（length, timeMs, valid を使う）
 * @param {{ timeLimitMs: number, damageParams?: object }} options
 * @returns {{
 *   state: object,
 *   order: 'none' | 'single' | 'sequential' | 'simultaneous',
 *   attacks: Array<{ attacker: string, target: string, damage: number, hpAfter: number,
 *                    length: number, damageLength: number }>,
 *   skipped: string | null,   // 先攻の攻撃で決着したため攻撃しなかった側
 * }}
 */
export function resolveRound(state, answers, { timeLimitMs, damageParams = CONFIG.damage }) {
  if (state.result) throw new Error('バトルはすでに決着しています');

  const hp = { ...state.hp };
  const attacks = [];
  let skipped = null;
  let order;

  const attack = (attacker) => {
    const target = otherSide(attacker);
    const { length, timeMs } = answers[attacker];
    const damage = calcDamage({ length, timeMs, timeLimitMs }, damageParams);
    hp[target] = Math.max(0, hp[target] - damage);
    // length：実際の文字数、damageLength：ダメージ計算に使った文字数（上限あり）
    attacks.push({ attacker, target, damage, hpAfter: hp[target], length, damageLength: damageLength(length, damageParams) });
  };

  const validSides = SIDES.filter((side) => isValid(answers[side]));

  if (validSides.length === 0) {
    order = 'none';
  } else if (validSides.length === 1) {
    order = 'single';
    attack(validSides[0]);
  } else if (answers.player.timeMs === answers.opponent.timeMs) {
    // 同時攻撃：ダメージは相手のHPに依存しないので、順に適用しても同時に適用したのと同じ
    order = 'simultaneous';
    attack('player');
    attack('opponent');
  } else {
    order = 'sequential';
    const first = answers.player.timeMs < answers.opponent.timeMs ? 'player' : 'opponent';
    const second = otherSide(first);
    attack(first);
    if (hp[second] > 0) attack(second);
    else skipped = second;
  }

  const noAttackStreak = attacks.length > 0 ? 0 : state.noAttackStreak + 1;

  let result = null;
  if (hp.player === 0 && hp.opponent === 0) result = { outcome: 'draw', reason: 'double-ko' };
  else if (hp.opponent === 0) result = { outcome: 'player', reason: 'ko' };
  else if (hp.player === 0) result = { outcome: 'opponent', reason: 'ko' };
  else if (noAttackStreak >= state.drawAfterNoAttackRounds) result = { outcome: 'draw', reason: 'no-attack' };

  return {
    state: Object.freeze({
      ...state,
      hp: Object.freeze(hp),
      round: state.round + 1,
      noAttackStreak,
      result: result && Object.freeze(result),
    }),
    order,
    attacks,
    skipped,
  };
}

/** 途中でやめた（離脱した）側の負けにする。 */
export function forfeit(state, side) {
  if (state.result) return state;
  return Object.freeze({
    ...state,
    result: Object.freeze({ outcome: otherSide(side), reason: 'forfeit' }),
  });
}
