// フレンド戦の部屋（docs/SPEC.md §10.2）：作成・参加・準備OK・開始。通信は RoomStore 越しに行う。
//
// 部屋データ（rooms/{code}）
//   meta:    { code, createdAt, expiresAt, status: 'waiting'|'playing'|'finished'|'aborted'|'closed', rules, version }
//   players: { host: { id, name, ready, lastSeen }, guest: { ... } }
//   match:   { status, round, state, startAt, result }            ← 開始後（ホストが書く）
//   rounds/{n}: { schedule, prompt, answers: { host, guest }, result }
// 両者は 'host' / 'guest' で表す（各端末で自分 = player、相手 = opponent に読み替える）。

import { CONFIG } from '../config.js';
import { scheduleRound } from '../core/roundSchedule.js';

export class RoomError extends Error {
  constructor(code) {
    super({
      not_found: '部屋が見つかりません',
      expired: '部屋の有効期限が切れています',
      full: 'この部屋は満員です',
      closed: 'この部屋は閉じられました',
      started: 'この部屋はすでに対戦中です',
      invalid: '部屋コードは6桁の数字です',
      busy: '部屋を作れませんでした。もう一度お試しください',
    }[code] ?? code);
    this.code = code;
  }
}

export const roomPath = (code) => `rooms/${code}`;
export const otherSide = (side) => (side === 'host' ? 'guest' : 'host');

export function generateRoomCode(random = Math.random, digits = CONFIG.friend.codeDigits) {
  let code = '';
  for (let i = 0; i < digits; i += 1) code += Math.floor(random() * 10);
  return code;
}

export function isValidRoomCode(code, digits = CONFIG.friend.codeDigits) {
  return new RegExp(`^\\d{${digits}}$`).test(code);
}

/** 部屋を作った時点のルール（途中で config が変わっても、この部屋では固定） */
export function roomRules(config = CONFIG) {
  return {
    timeLimitMs: config.battle.timeLimitSec * 1000,
    maxHp: config.battle.maxHp,
    drawAfter: config.battle.drawAfterNoAttackRounds,
    timing: { ...config.battle.timing },
    friend: { ...config.friend },
  };
}

export function isExpired(room, now) {
  return !room?.meta || now >= room.meta.expiresAt;
}

/** ホスト：部屋を作る。戻り値は部屋コード */
export async function createRoom(store, { clientId, name, rules = roomRules(), random = Math.random }) {
  const now = store.serverNow();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateRoomCode(random);
    const created = await store.createIfAbsent(roomPath(code), {
      meta: { code, createdAt: now, expiresAt: now + rules.friend.roomTtlMs, status: 'waiting', rules, version: 1 },
      players: { host: { id: clientId, name, ready: false, lastSeen: now } },
    });
    if (created) return code;
    // 同じコードの部屋があった：期限切れなら上書きしてよい
    const existing = await store.get(roomPath(code));
    if (isExpired(existing, now)) {
      await store.set(roomPath(code), null);
    }
  }
  throw new RoomError('busy');
}

/** ゲスト：部屋に参加する。戻り値は自分の立場（同じ端末の再参加なら元の立場） */
export async function joinRoom(store, code, { clientId, name }) {
  if (!isValidRoomCode(code)) throw new RoomError('invalid');
  const now = store.serverNow();
  const room = await store.get(roomPath(code));
  if (!room?.meta) throw new RoomError('not_found');
  if (room.meta.status === 'closed') throw new RoomError('closed');
  if (isExpired(room, now)) throw new RoomError('expired');
  const { host, guest } = room.players ?? {};
  if (host?.id === clientId) return 'host';
  if (guest?.id === clientId) return 'guest';
  if (guest) throw new RoomError('full');
  if (room.meta.status !== 'waiting') throw new RoomError('started');
  await store.set(`${roomPath(code)}/players/guest`, { id: clientId, name, ready: false, lastSeen: now });
  return 'guest';
}

export async function setReady(store, code, side, ready) {
  await store.set(`${roomPath(code)}/players/${side}/ready`, ready);
}

export async function touch(store, code, side) {
  await store.set(`${roomPath(code)}/players/${side}/lastSeen`, store.serverNow());
}

/** ロビーから抜ける。ホストが抜けたら部屋を閉じる */
export async function leaveRoom(store, code, side) {
  if (side === 'host') await store.set(`${roomPath(code)}/meta/status`, 'closed');
  else await store.set(`${roomPath(code)}/players/guest`, null);
}

/** 1ラウンド分のデータ（時刻表はサーバー時刻）。お題は FIGHT! まで画面に出さない */
export function buildRound(pool, rules, startAt, avoid = null) {
  const prompt = pool.next({ avoid });
  return { schedule: scheduleRound(startAt, rules.timing, rules.timeLimitMs), prompt };
}

/** 対戦開始時の状態（battle.js の状態を host / guest で持つ） */
export function initialMatchState(rules) {
  return {
    maxHp: rules.maxHp,
    drawAfterNoAttackRounds: rules.drawAfter,
    hp: { host: rules.maxHp, guest: rules.maxHp },
    round: 0,
    noAttackStreak: 0,
    result: null,
  };
}

/** ホスト：両者の準備OKを確認して対戦を始める（ROUND 1 の時刻表とお題を書く） */
export async function startMatch(store, code, { pool }) {
  const room = await store.get(roomPath(code));
  const { host, guest } = room?.players ?? {};
  if (!host?.ready || !guest?.ready || room.meta.status !== 'waiting') return false;
  const rules = room.meta.rules;
  const startAt = store.serverNow() + rules.friend.startDelayMs;
  await store.update(roomPath(code), {
    'rounds/1': buildRound(pool, rules, startAt),
    match: { status: 'playing', round: 1, state: initialMatchState(rules), startAt, result: null },
    'meta/status': 'playing',
  });
  return true;
}
