// database.rules.json のテスト（簡易評価器 rulesEval.js を使う。本物の Firebase でも同じケースを確認すること）。

import { test, assert } from './harness.js';
import { loadJson } from './loadJson.js';
import { RulesEngine } from './rulesEval.js';

const NOW = 1_800_000_000_000;
const CODE = '123456';
const ROOM = `rooms/${CODE}`;
const HOST = { uid: 'uid-host' };
const GUEST = { uid: 'uid-guest' };
const OTHER = { uid: 'uid-third' };

let enginePromise = null;
const engine = () => (enginePromise ??= loadJson('database.rules.json').then((rules) => new RulesEngine(rules, { now: () => NOW })));

/** 対戦中の部屋（ROUND 1 の時刻表・お題あり、回答なし） */
function playingDb() {
  return {
    rooms: {
      [CODE]: {
        meta: { code: CODE, createdAt: NOW - 1000, expiresAt: NOW + 1_800_000, status: 'playing', version: 1 },
        players: {
          host: { id: HOST.uid, name: 'H', ready: true, lastSeen: NOW },
          guest: { id: GUEST.uid, name: 'G', ready: true, lastSeen: NOW },
        },
        match: { status: 'playing', round: 1, state: { hp: { host: 100, guest: 100 } } },
        rounds: { 1: { schedule: { fightAt: NOW }, prompt: { first: 'あ', last: 'め' } } },
      },
    },
  };
}

const answer = (input) => ({ status: 'answered', input, timeMs: 1200, submittedAt: NOW });

// ---------- ご指定の8ケース ----------

test('ルール1：ホストは自分の answer を書ける', async () => {
  const r = (await engine()).set(playingDb(), HOST, `${ROOM}/rounds/1/answers/host`, answer('あめ'));
  assert.ok(r.ok, r.why);
});

test('ルール2：ホストは guest の answer を書けない（新規も上書きも）', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), HOST, `${ROOM}/rounds/1/answers/guest`, answer('ずる')).ok, false, '新規');
  const withGuestAnswer = e.set(playingDb(), GUEST, `${ROOM}/rounds/1/answers/guest`, answer('あめ')).db;
  assert.equal(e.set(withGuestAnswer, HOST, `${ROOM}/rounds/1/answers/guest`, answer('ずる')).ok, false, '上書き');
  assert.equal(e.set(withGuestAnswer, HOST, `${ROOM}/rounds/1/answers/guest`, null).ok, false, '削除');
  assert.equal(e.update(withGuestAnswer, HOST, ROOM, { 'rounds/1/answers/guest/input': 'ずる' }).ok, false, '一部だけ書き換え');
});

test('ルール3：ゲストは自分の answer を書ける', async () => {
  const r = (await engine()).set(playingDb(), GUEST, `${ROOM}/rounds/1/answers/guest`, answer('あめ'));
  assert.ok(r.ok, r.why);
});

test('ルール4：ゲストは host の answer を書けない', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/rounds/1/answers/host`, answer('ずる')).ok, false, '新規');
  const withHostAnswer = e.set(playingDb(), HOST, `${ROOM}/rounds/1/answers/host`, answer('あめ')).db;
  assert.equal(e.set(withHostAnswer, GUEST, `${ROOM}/rounds/1/answers/host`, answer('ずる')).ok, false, '上書き');
});

test('ルール5：ホストは schedule / prompt / result を書ける（裁定の一括書き込みも）', async () => {
  const e = await engine();
  for (const field of ['schedule', 'prompt', 'result']) {
    const r = e.set(playingDb(), HOST, `${ROOM}/rounds/1/${field}`, { x: 1 });
    assert.ok(r.ok, `${field}: ${r.why}`);
  }
  // FriendSession のホストが判定時に行う一括書き込み
  const judge = e.update(playingDb(), HOST, ROOM, {
    'rounds/1/result': { finished: false, revealAt: NOW + 800, nextRoundAt: NOW + 3800 },
    'match/state': { hp: { host: 100, guest: 80 } },
    'rounds/2/schedule': { fightAt: NOW + 5200 },
    'rounds/2/prompt': { first: 'い', last: 'ぬ' },
    'match/round': 2,
  });
  assert.ok(judge.ok, `${judge.path}: ${judge.why}`);
});

test('ルール6：ゲストは schedule / prompt / result を書けない（match の裁定データも）', async () => {
  const e = await engine();
  for (const field of ['schedule', 'prompt', 'result']) {
    assert.equal(e.set(playingDb(), GUEST, `${ROOM}/rounds/1/${field}`, { x: 1 }).ok, false, field);
    assert.equal(e.set(playingDb(), GUEST, `${ROOM}/rounds/2/${field}`, { x: 1 }).ok, false, `新しいラウンドの ${field}`);
  }
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/rounds/2`, { schedule: {}, prompt: {} }).ok, false, 'ラウンド丸ごと');
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/state`, { hp: { host: 0, guest: 100 } }).ok, false, 'match/state');
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/round`, 9).ok, false, 'match/round');
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/result`, { outcome: 'guest', reason: 'ko' }).ok, false, '自分の勝ちにする');
});

test('ルール7：3人目は guest として参加できない（ゲスト枠が埋まっている）', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/players/guest`, { id: OTHER.uid, name: 'X', ready: false, lastSeen: NOW }).ok, false, 'ゲスト枠');
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/players/third`, { id: OTHER.uid, name: 'X' }).ok, false, '3つ目の枠');
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/players/host`, { id: OTHER.uid, name: 'X' }).ok, false, 'ホスト枠の乗っ取り');
});

test('ルール8：未ログインのユーザーは部屋を読めない・書けない', async () => {
  const e = await engine();
  assert.equal(e.canRead(playingDb(), null, ROOM), false, '部屋を読む');
  assert.equal(e.canRead(playingDb(), null, `${ROOM}/rounds/1/prompt`), false, 'お題を読む');
  assert.equal(e.set({}, null, `rooms/654321`, { meta: {}, players: { host: { id: null } } }).ok, false, '部屋を作る');
  assert.equal(e.set(playingDb(), null, `${ROOM}/players/guest/ready`, false).ok, false, '書き換える');
});

// ---------- 追加：アプリの正規の操作は拒否されない／その他の改ざん ----------

test('ルール追加：部屋の作成・参加・準備OK・接続状態・退出は本人だけができる', async () => {
  const e = await engine();
  const create = e.set({}, HOST, 'rooms/654321', {
    meta: { code: '654321', createdAt: NOW, expiresAt: NOW + 1_800_000, status: 'waiting', version: 1 },
    players: { host: { id: HOST.uid, name: 'H', ready: false, lastSeen: NOW } },
  });
  assert.ok(create.ok, `作成：${create.why}`);
  assert.equal(e.set(create.db, OTHER, 'rooms/654321', { players: { host: { id: OTHER.uid } } }).ok, false, '既存の部屋の上書き');
  const join = e.set(create.db, GUEST, 'rooms/654321/players/guest', { id: GUEST.uid, name: 'G', ready: false, lastSeen: NOW });
  assert.ok(join.ok, `参加：${join.why}`);
  assert.ok(e.set(join.db, GUEST, 'rooms/654321/players/guest/ready', true).ok, '準備OK（ゲスト）');
  assert.ok(e.set(join.db, HOST, 'rooms/654321/players/host/connected', true).ok, '接続状態（ホスト）');
  assert.equal(e.set(join.db, HOST, 'rooms/654321/players/guest/ready', true).ok, false, 'ホストがゲストの準備OKを押す');
  assert.equal(e.set(join.db, GUEST, 'rooms/654321/players/host/ready', true).ok, false, 'ゲストがホストの準備OKを押す');
  assert.ok(e.set(join.db, GUEST, 'rooms/654321/players/guest', null).ok, 'ゲストの退出');
  assert.ok(e.set(join.db, HOST, 'rooms/654321/meta/status', 'closed').ok, 'ホストが部屋を閉じる');
  assert.equal(e.set(join.db, GUEST, 'rooms/654321/meta/status', 'closed').ok, false, 'ゲストが部屋を閉じる');
  assert.equal(e.set({}, GUEST, 'rooms/111111/players/guest', { id: GUEST.uid, name: 'G' }).ok, false, '存在しない部屋へのゲスト参加（空の部屋を作れない）');
  assert.equal(e.set({}, HOST, 'rooms/12ab', { players: { host: { id: HOST.uid } } }).ok, false, '6桁数字でない部屋コード');
});

test('ルール追加：回答は1回だけ（送信後に自分でも書き換えられない）', async () => {
  const e = await engine();
  const first = e.set(playingDb(), GUEST, `${ROOM}/rounds/1/answers/guest`, answer('あめ'));
  assert.ok(first.ok);
  assert.equal(e.set(first.db, GUEST, `${ROOM}/rounds/1/answers/guest`, answer('あたため')).ok, false);
});

// ---------- 試合状態・勝敗の確定はホストだけ（降参リクエスト） ----------

test('確定1：ゲストは meta.status を直接変更できない', async () => {
  const e = await engine();
  for (const status of ['finished', 'aborted', 'closed', 'waiting']) {
    assert.equal(e.set(playingDb(), GUEST, `${ROOM}/meta/status`, status).ok, false, status);
  }
});

test('確定2：ゲストは match.status を直接変更できない', async () => {
  const e = await engine();
  for (const status of ['finished', 'aborted', 'playing']) {
    assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/status`, status).ok, false, status);
  }
});

test('確定3：ゲストは match.result を直接変更できない（自分の負けの形でも）', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/result`, { outcome: 'host', reason: 'forfeit', decidedRound: 1 }).ok, false, '降参の形');
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/match/result`, { outcome: 'guest', reason: 'ko' }).ok, false, '自分の勝ち');
  const oldStyle = e.update(playingDb(), GUEST, ROOM, { 'match/status': 'finished', 'match/result': { outcome: 'host', reason: 'forfeit' }, 'meta/status': 'finished' });
  assert.equal(oldStyle.ok, false, '以前の方式（ゲストが直接確定）');
});

test('確定4：ゲストは自分の降参リクエスト（signals/forfeit/guest）を書ける（1回だけ）', async () => {
  const e = await engine();
  const r = e.set(playingDb(), GUEST, `${ROOM}/signals/forfeit/guest`, { at: NOW, round: 1 });
  assert.ok(r.ok, r.why);
  assert.equal(e.set(r.db, GUEST, `${ROOM}/signals/forfeit/guest`, null).ok, false, '取り消し・書き換えはできない');
});

test('確定5：ホストは降参リクエストを検知してゲストの敗北を確定できる', async () => {
  const e = await engine();
  const signaled = e.set(playingDb(), GUEST, `${ROOM}/signals/forfeit/guest`, { at: NOW, round: 1 }).db;
  const confirm = e.update(signaled, HOST, ROOM, {
    'match/status': 'finished',
    'match/result': { outcome: 'host', reason: 'forfeit', decidedRound: 1 },
    'meta/status': 'finished',
  });
  assert.ok(confirm.ok, `${confirm.path}: ${confirm.why}`);
});

test('確定6：第三者は降参リクエストを書けない', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/signals/forfeit/guest`, { at: NOW }).ok, false);
  assert.equal(e.set(playingDb(), null, `${ROOM}/signals/forfeit/guest`, { at: NOW }).ok, false, '未ログイン');
});

test('確定7：ホストはゲストの降参リクエストを偽装できない', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), HOST, `${ROOM}/signals/forfeit/guest`, { at: NOW }).ok, false, 'guest の降参');
  assert.equal(e.set(playingDb(), HOST, `${ROOM}/signals/forfeit/host`, { at: NOW }).ok, false, '別の枠');
  assert.equal(e.set(playingDb(), GUEST, `${ROOM}/signals/other`, { x: 1 }).ok, false, 'signals の他の項目');
});

test('確定8：切断20秒後の中止（aborted）はホストだけが書ける', async () => {
  const e = await engine();
  const abort = { 'match/status': 'aborted', 'meta/status': 'aborted' };
  const byHost = e.update(playingDb(), HOST, ROOM, abort);
  assert.ok(byHost.ok, `${byHost.path}: ${byHost.why}`);
  assert.equal(e.update(playingDb(), GUEST, ROOM, abort).ok, false, 'ゲスト');
  assert.equal(e.update(playingDb(), OTHER, ROOM, abort).ok, false, '第三者');
});

test('ルール追加：第三者は他人の部屋を書き換えられない・期限切れの部屋だけ削除できる', async () => {
  const e = await engine();
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/match/state`, {}).ok, false, 'match');
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/rounds/1/answers/guest`, answer('x')).ok, false, 'answer');
  assert.equal(e.set(playingDb(), OTHER, `${ROOM}/meta/status`, 'aborted').ok, false, '中止');
  assert.equal(e.set(playingDb(), OTHER, ROOM, null).ok, false, '有効な部屋の削除');
  const expired = playingDb();
  expired.rooms[CODE].meta.expiresAt = NOW - 1;
  assert.ok(e.set(expired, OTHER, ROOM, null).ok, '期限切れの部屋の削除（コードの再利用）');
  assert.equal(e.canRead(playingDb(), OTHER, 'rooms'), false, '部屋の一覧は読めない');
  assert.ok(e.canRead(playingDb(), OTHER, ROOM), 'コードを知っている部屋は読める（参加のため）');
});
