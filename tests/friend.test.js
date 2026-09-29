import { test, assert } from './harness.js';
import { LocalRoomStore, mapBackend } from '../src/net/roomStore.js';
import { createRoom, joinRoom, setReady, startMatch, roomPath, roomRules, RoomError, isValidRoomCode } from '../src/match/friendRoom.js';
import { FriendSession, viewSide, pairToView, resolutionToView } from '../src/match/friendSession.js';
import { PromptPool } from '../src/core/prompt.js';
import { WordValidator } from '../src/dictionary/wordValidator.js';
import { SaveStore } from '../src/storage/storage.js';
import { CONFIG } from '../src/config.js';
import { memoryOfficial } from './fakes.js';
import { DelayedRoomStore } from '../src/net/delayedRoomStore.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newStore(clock) {
  return new LocalRoomStore({ backend: mapBackend(), clock });
}

// ---------- RoomStore（Map 版） ----------

test('RoomStore：パスで書いて、上の階層でまとめて読める', async () => {
  const store = newStore();
  await store.set('rooms/1/meta', { a: 1 });
  await store.set('rooms/1/players/host', { name: 'A' });
  assert.deepEqual(await store.get('rooms/1'), { meta: { a: 1 }, players: { host: { name: 'A' } } });
  assert.deepEqual(await store.get('rooms/1/players/host/name'), 'A');
  assert.equal(await store.get('rooms/2'), null);
});

test('RoomStore：あとから書いた深いパスが、先に書いたオブジェクトの中身より優先される', async () => {
  const store = newStore();
  await store.set('rooms/1', { meta: { status: 'waiting', code: '1' } });
  await store.set('rooms/1/meta/status', 'playing');
  assert.deepEqual(await store.get('rooms/1/meta'), { status: 'playing', code: '1' });
  await store.set('rooms/1/meta/code', null);
  assert.deepEqual(await store.get('rooms/1/meta'), { status: 'playing' });
});

test('RoomStore：update は複数の項目をまとめて書く／createIfAbsent は無いときだけ作る', async () => {
  const store = newStore();
  assert.equal(await store.createIfAbsent('rooms/9', { x: 1 }), true);
  assert.equal(await store.createIfAbsent('rooms/9', { x: 2 }), false);
  await store.update('rooms/9', { 'meta/status': 'ok', y: 3 });
  const room = await store.get('rooms/9');
  assert.equal(room.x, 1);
  assert.equal(room.y, 3);
  assert.deepEqual(room.meta, { status: 'ok' });
});

test('RoomStore：購読すると変更が通知される（同時の変更は1回にまとめる）', async () => {
  const store = newStore();
  const seen = [];
  const off = store.subscribe('rooms/1', (v) => seen.push(v));
  await sleep(0);
  await store.update('rooms/1', { a: 1, b: 2 });
  await sleep(0);
  await store.set('rooms/2', { other: true });
  await sleep(0);
  off();
  await store.set('rooms/1/a', 9);
  await sleep(0);
  assert.deepEqual(seen, [null, { a: 1, b: 2 }]);
});

// ---------- 部屋 ----------

test('部屋：6桁コードで作成し、別の端末が参加できる', async () => {
  const store = newStore();
  const code = await createRoom(store, { clientId: 'A', name: 'ホスト' });
  assert.ok(isValidRoomCode(code), code);
  assert.equal(await joinRoom(store, code, { clientId: 'B', name: 'ゲスト' }), 'guest');
  const room = await store.get(roomPath(code));
  assert.equal(room.players.host.name, 'ホスト');
  assert.equal(room.players.guest.name, 'ゲスト');
  assert.equal(room.meta.expiresAt - room.meta.createdAt, 30 * 60 * 1000, '有効期限30分');
});

test('部屋：満員・存在しない・期限切れ・形式違いは参加できない。同じ端末は元の立場で再参加', async () => {
  let now = 1_000_000;
  const store = newStore(() => now);
  const code = await createRoom(store, { clientId: 'A', name: 'A' });
  await joinRoom(store, code, { clientId: 'B', name: 'B' });
  const errorOf = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof RoomError ? e.code : e.message; } };
  assert.equal(await errorOf(() => joinRoom(store, code, { clientId: 'C', name: 'C' })), 'full');
  assert.equal(await errorOf(() => joinRoom(store, '000000', { clientId: 'C', name: 'C' })), 'not_found');
  assert.equal(await errorOf(() => joinRoom(store, '12ab', { clientId: 'C', name: 'C' })), 'invalid');
  assert.equal(await joinRoom(store, code, { clientId: 'B', name: 'B' }), 'guest');
  assert.equal(await joinRoom(store, code, { clientId: 'A', name: 'A' }), 'host');
  now += 30 * 60 * 1000;
  assert.equal(await errorOf(() => joinRoom(store, code, { clientId: 'B', name: 'B' })), 'expired');
});

test('部屋：両者の準備OKで開始し、ROUND 1 の時刻表とお題が書かれる', async () => {
  const store = newStore();
  const pool = new PromptPool([['あめ'], ['あたため']]);
  const code = await createRoom(store, { clientId: 'A', name: 'A' });
  await joinRoom(store, code, { clientId: 'B', name: 'B' });
  await setReady(store, code, 'host', true);
  assert.equal(await startMatch(store, code, { pool }), false, '片方だけでは始まらない');
  await setReady(store, code, 'guest', true);
  assert.equal(await startMatch(store, code, { pool }), true);
  const room = await store.get(roomPath(code));
  assert.equal(room.match.status, 'playing');
  assert.deepEqual(room.rounds[1].prompt, { first: 'あ', last: 'め' });
  const s = room.rounds[1].schedule;
  assert.equal(s.fightAt - s.roundAt, CONFIG.battle.timing.roundLabelMs + CONFIG.battle.timing.readyMs);
});

// ---------- 視点の読み替え ----------

test('視点：host / guest を自分 = player、相手 = opponent に読み替える', () => {
  assert.equal(viewSide('host', 'host'), 'player');
  assert.equal(viewSide('host', 'guest'), 'opponent');
  assert.equal(viewSide('draw', 'guest'), 'draw');
  assert.deepEqual(pairToView({ host: 10, guest: 20 }, 'guest'), { player: 20, opponent: 10 });
  const res = resolutionToView({ order: 'sequential', skipped: 'guest', attacks: [{ attacker: 'host', target: 'guest', damage: 5 }] }, 'guest');
  assert.equal(res.skipped, 'player');
  assert.equal(res.attacks[0].attacker, 'opponent');
});

// ---------- 2つの FriendSession で1試合 ----------

function fastRules() {
  const rules = roomRules();
  rules.timeLimitMs = 600;
  rules.maxHp = 30;
  rules.timing = { roundLabelMs: 40, readyMs: 40, fightMs: 10, revealMs: 120 };
  rules.friend = { ...rules.friend, startDelayMs: 60, answerGraceMs: 60, revealDelayMs: 10, heartbeatMs: 100, disconnectAfterMs: 3000, reconnectWaitMs: 3000 };
  return rules;
}

function fakeData() {
  const words = [['あめ'], ['あたため'], ['あおいあめ'], ['いぬ'], ['いたずらいぬ']];
  const official = memoryOfficial(words);
  const extra = { lookup: async () => null, preload: async () => {} };
  const validator = new WordValidator({ sources: [{ name: 'official', dictionary: official }, { name: 'extra', dictionary: extra }], minLength: 2 });
  return { official, extra, validator, promptPool: Promise.resolve(new PromptPool(words, { minCandidates: 2 })) };
}

function memorySave() {
  const map = new Map();
  return new SaveStore({ storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) } });
}

test('フレンド戦：ホストとゲストで1試合最後まで進み、進行タイミングが揃う（時間切れのラウンドを含む）', async () => {
  const store = newStore();
  const data = fakeData();
  const pool = await data.promptPool;
  const code = await createRoom(store, { clientId: 'H', name: 'はな', rules: fastRules() });
  await joinRoom(store, code, { clientId: 'G', name: 'げん' });
  await setReady(store, code, 'host', true);
  await setReady(store, code, 'guest', true);
  await startMatch(store, code, { pool });
  const room = await store.get(roomPath(code));

  const saves = { host: memorySave(), guest: memorySave() };
  const logs = { host: [], guest: [] };
  const sessions = {};
  const ended = {};
  for (const side of ['host', 'guest']) {
    const s = new FriendSession({ store, code, side, room, data, storage: saves[side] });
    sessions[side] = s;
    let roundNo = 0;
    s.on((e) => {
      logs[side].push({ type: e.type, t: performance.now(), e });
      if (e.type === 'round') roundNo = e.roundNo;
      if (e.type === 'fight') {
        // ホストは長い言葉ですぐ答える。ゲストは2ラウンド目だけ答えない（時間切れ）
        const word = e.prompt.first === 'あ' ? 'あおいあめ' : 'いたずらいぬ';
        if (side === 'host') setTimeout(() => s.submitAnswer(word), 20);
        else if (roundNo !== 2) setTimeout(() => s.submitAnswer('あいうえお'), 40);
      }
      if (e.type === 'end') ended[side] = e;
    });
    s.start();
  }

  const until = performance.now() + 15000;
  while ((!ended.host || !ended.guest) && performance.now() < until) await sleep(20);
  sessions.host.dispose();
  sessions.guest.dispose();

  assert.ok(ended.host && ended.guest, '両者とも試合が終わる');
  assert.equal(ended.host.outcome, 'win');
  assert.equal(ended.guest.outcome, 'lose');
  assert.equal(ended.host.reason, 'ko');
  assert.equal(saves.host.load().record.friend.wins, 1);
  assert.equal(saves.guest.load().record.friend.losses, 1);
  assert.equal(saves.host.load().record.cpu.wins, 0, 'cpu の戦績は変わらない');

  const times = (side, type) => logs[side].filter((l) => l.type === type).map((l) => l.t);
  for (const type of ['round', 'ready', 'fight', 'result']) {
    const h = times('host', type);
    const g = times('guest', type);
    assert.equal(h.length, g.length, `${type} の回数が同じ`);
    assert.ok(h.length >= 2, `${type} が複数ラウンド分ある`);
    h.forEach((t, i) => assert.ok(Math.abs(t - g[i]) < 30, `${type}[${i}] のずれ ${Math.round(t - g[i])}ms`));
  }

  // 判定表示から次の ROUND まで revealMs（120ms）固定
  const rounds = times('host', 'round');
  const results = times('host', 'result');
  results.slice(0, -1).forEach((t, i) => {
    const gap = rounds[i + 1] - t;
    assert.ok(Math.abs(gap - 120) < 30, `判定→次ROUND ${Math.round(gap)}ms`);
  });

  // 2ラウンド目：ゲストは時間切れ、HP は両者の視点で対応している
  const r2 = logs.guest.filter((l) => l.type === 'result')[1].e;
  assert.equal(r2.judged.player.status, 'timeout');
  const h2 = logs.host.filter((l) => l.type === 'result')[1].e;
  assert.deepEqual(h2.hp, { player: r2.hp.opponent, opponent: r2.hp.player });
});

test('フレンド戦：相手の接続が途絶えたら接続待ちを通知し、復帰待ちを過ぎたら中止（勝敗は記録しない）', async () => {
  const store = newStore();
  const data = fakeData();
  const rules = fastRules();
  rules.timeLimitMs = 5000; // 試合が先に終わらないよう長めにする
  rules.friend = { ...rules.friend, disconnectAfterMs: 250, reconnectWaitMs: 400 };
  const code = await createRoom(store, { clientId: 'H', name: 'H', rules });
  await joinRoom(store, code, { clientId: 'G', name: 'G' });
  await setReady(store, code, 'host', true);
  await setReady(store, code, 'guest', true);
  await startMatch(store, code, { pool: await data.promptPool });
  const room = await store.get(roomPath(code));

  const hostSave = memorySave();
  const host = new FriendSession({ store, code, side: 'host', room, data, storage: hostSave });
  const guest = new FriendSession({ store, code, side: 'guest', room, data, storage: memorySave() });
  const events = [];
  host.on((e) => events.push(e));
  host.start();
  guest.start();
  await sleep(150);
  guest.dispose(); // ゲストの端末が落ちた（接続確認が止まる）

  const until = performance.now() + 5000;
  while (!events.some((e) => e.type === 'end') && performance.now() < until) await sleep(20);
  host.dispose();

  assert.ok(events.some((e) => e.type === 'connection' && e.opponentConnected === false), '接続待ちが通知される');
  const end = events.find((e) => e.type === 'end');
  assert.equal(end?.outcome, 'aborted');
  const save = hostSave.load();
  assert.deepEqual(save.record.friend, { wins: 0, losses: 0, draws: 0 });
  assert.equal(save.activeMatch, null);
  assert.equal((await store.get(roomPath(code))).match.status, 'aborted');
});

test('通信遅延の包み：書き込みと通知が遅れ、順序は保たれる', async () => {
  const inner = newStore();
  const store = new DelayedRoomStore(inner, { latencyMs: 80 });
  const seen = [];
  store.subscribe('rooms/1/v', (v) => seen.push([v, performance.now()]));
  await sleep(120);
  const t0 = performance.now();
  store.set('rooms/1/v', 1);
  store.set('rooms/1/v', 2);
  await sleep(40);
  assert.equal(await inner.get('rooms/1/v'), null, '書き込みはまだ届かない');
  await sleep(250);
  assert.deepEqual(seen.map(([v]) => v), [null, 1, 2], '書いた順に通知される');
  assert.ok(seen.at(-1)[1] - t0 >= 150, `書き込み＋通知で約160ms遅れる（${Math.round(seen.at(-1)[1] - t0)}ms）`);
});

test('フレンド戦：相手の connected が false（Firebase の onDisconnect）なら、すぐ接続待みにして復帰待ち超過で中止', async () => {
  const store = newStore();
  const data = fakeData();
  const rules = fastRules();
  rules.timeLimitMs = 5000;
  rules.friend = { ...rules.friend, disconnectAfterMs: 5000, reconnectWaitMs: 500 };
  const code = await createRoom(store, { clientId: 'H', name: 'H', rules });
  await joinRoom(store, code, { clientId: 'G', name: 'G' });
  await setReady(store, code, 'host', true);
  await setReady(store, code, 'guest', true);
  await startMatch(store, code, { pool: await data.promptPool });
  const room = await store.get(roomPath(code));
  const host = new FriendSession({ store, code, side: 'host', room, data, storage: memorySave() });
  const events = [];
  host.on((e) => events.push({ e, t: performance.now() }));
  host.start();
  await sleep(200);
  // ゲストの端末が落ちた：サーバーが connected = false、lastSeen = 切断時刻 を書く
  const lostAt = performance.now();
  await store.update(roomPath(code), { 'players/guest/connected': false, 'players/guest/lastSeen': store.serverNow() });
  const until = performance.now() + 4000;
  while (!events.some(({ e }) => e.type === 'end') && performance.now() < until) await sleep(20);
  host.dispose();
  const firstNotice = events.find(({ e }) => e.type === 'connection' && !e.opponentConnected);
  assert.ok(firstNotice && firstNotice.t - lostAt < 1300, `接続待ちの通知が lastSeen の途絶（5秒）を待たずに出る（${firstNotice && Math.round(firstNotice.t - lostAt)}ms）`);
  const end = events.find(({ e }) => e.type === 'end');
  assert.equal(end?.e.outcome, 'aborted');
  assert.ok(end.t - lostAt < 2500, `復帰待ち（0.5秒）を過ぎたら中止（${Math.round(end.t - lostAt)}ms）`);
});
