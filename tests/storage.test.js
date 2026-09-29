import { test, assert } from './harness.js';
import { SaveStore, createDefaultSave, normalizeSave, winRate } from '../src/storage/storage.js';

const KEY = 'test.save';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    raw: (k) => map.get(k),
  };
}

function clock(start = Date.UTC(2026, 8, 28, 9, 0, 0)) {
  let t = start;
  return () => new Date((t += 1000));
}

function createStore(storage = memoryStorage(), opts = {}) {
  return new SaveStore({ storage, key: KEY, historyLimit: 30, now: clock(), ...opts });
}

// ---------- 既定値・読み込み ----------

test('初期状態：戦績0・履歴なし・rating.ranked は null・進行中フラグなし', () => {
  const save = createStore().load();
  assert.deepEqual(save, createDefaultSave());
  assert.deepEqual(save.record.cpu, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.record.ranked, { wins: 0, losses: 0, draws: 0 });
  assert.equal(save.rating.ranked, null);
  assert.equal(save.activeMatch, null);
});

test('壊れた JSON は既定値で読み込む', () => {
  const save = createStore(memoryStorage({ [KEY]: '{broken' })).load();
  assert.deepEqual(save, createDefaultSave());
});

test('壊れた項目だけ既定値で補う', () => {
  const save = normalizeSave({
    record: { cpu: { wins: 3, losses: -1, draws: 'x' } },
    history: { cpu: [{ at: '2026-09-28T00:00:00Z', outcome: 'win', cpuId: 'easy', rounds: 5 }, { bad: true }] },
    activeMatch: { mode: 'unknown' },
  });
  assert.deepEqual(save.record.cpu, { wins: 3, losses: 0, draws: 0 });
  assert.equal(save.history.cpu.length, 1);
  assert.equal(save.activeMatch, null);
});

// ---------- 通常の決着 ----------

test('バトル開始で進行中フラグが立ち、決着で記録されてフラグが消える', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.beginMatch({ mode: 'cpu', cpuId: 'hard' });
  assert.equal(store.load().activeMatch.cpuId, 'hard');

  store.setActiveRound(3);
  assert.equal(store.load().activeMatch.round, 3);

  const entry = store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 3 });
  const save = store.load();
  assert.equal(save.activeMatch, null);
  assert.deepEqual(save.record.cpu, { wins: 1, losses: 0, draws: 0 });
  assert.equal(save.history.cpu.length, 1);
  assert.deepEqual(save.history.cpu[0], entry);
  assert.equal(entry.mode, 'cpu');
  assert.equal(entry.cpuId, 'hard');
  assert.equal(entry.outcome, 'win');
  assert.equal(entry.reason, 'ko');
  assert.equal(entry.rounds, 3);
  assert.ok(!Number.isNaN(Date.parse(entry.at)), '日時は ISO 形式');

  // localStorage に保存されている
  assert.equal(JSON.parse(storage.raw(KEY)).record.cpu.wins, 1);
});

test('勝ち・負け・引き分けがそれぞれ数えられる', () => {
  const store = createStore();
  for (const outcome of ['win', 'lose', 'lose', 'draw']) {
    store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
    store.finishMatch({ outcome, reason: 'ko', rounds: 1 });
  }
  assert.deepEqual(store.load().record.cpu, { wins: 1, losses: 2, draws: 1 });
});

test('進行中フラグがなければ記録しない（二重記録の防止）', () => {
  const store = createStore();
  store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
  assert.ok(store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 2 }));
  assert.equal(store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 2 }), null);
  assert.equal(store.load().record.cpu.wins, 1);
});

test('CPU戦ではレーティングも ranked の戦績・履歴も変わらない', () => {
  const store = createStore(memoryStorage({ [KEY]: JSON.stringify({ ...createDefaultSave(), rating: { ranked: 1500 } }) }));
  store.beginMatch({ mode: 'cpu', cpuId: 'normal' });
  store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 4 });
  const save = store.load();
  assert.equal(save.rating.ranked, 1500);
  assert.deepEqual(save.record.ranked, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.history.ranked, []);
});

// ---------- 履歴 ----------

test('履歴は新しい順・最大30件', () => {
  const store = createStore();
  for (let i = 1; i <= 35; i += 1) {
    store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
    store.finishMatch({ outcome: 'win', reason: 'ko', rounds: i });
  }
  const { history, record } = store.load();
  assert.equal(history.cpu.length, 30);
  assert.equal(history.cpu[0].rounds, 35, '先頭が最新');
  assert.equal(history.cpu[29].rounds, 6);
  assert.equal(record.cpu.wins, 35, '戦績は履歴の件数制限と無関係に数える');
});

// ---------- 途中離脱 ----------

test('前回の進行中フラグが残っていれば、敗北として1回だけ記録してフラグを消す', () => {
  const storage = memoryStorage();
  const first = createStore(storage);
  first.beginMatch({ mode: 'cpu', cpuId: 'normal' });
  first.setActiveRound(4);
  // ここでリロード（ページが破棄される）

  const next = createStore(storage);
  const entry = next.recoverAbandonedMatch();
  assert.equal(entry.outcome, 'lose');
  assert.equal(entry.reason, 'abandon');
  assert.equal(entry.rounds, 4);
  assert.equal(entry.cpuId, 'normal');

  const save = next.load();
  assert.equal(save.activeMatch, null);
  assert.deepEqual(save.record.cpu, { wins: 0, losses: 1, draws: 0 });

  // もう一度起動しても二重に記録しない
  assert.equal(createStore(storage).recoverAbandonedMatch(), null);
  assert.equal(createStore(storage).load().record.cpu.losses, 1);
});

test('1問目の出題前に離脱した場合は 0問目として記録', () => {
  const storage = memoryStorage();
  createStore(storage).beginMatch({ mode: 'cpu', cpuId: 'easy' });
  assert.equal(createStore(storage).recoverAbandonedMatch().rounds, 0);
});

test('進行中フラグがなければ何も記録しない（説明画面などでの離脱）', () => {
  const store = createStore();
  assert.equal(store.recoverAbandonedMatch(), null);
  assert.deepEqual(store.load().record.cpu, { wins: 0, losses: 0, draws: 0 });
});

test('決着後に離脱しても敗北は増えない', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
  store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 5 });
  assert.equal(createStore(storage).recoverAbandonedMatch(), null);
  assert.deepEqual(createStore(storage).load().record.cpu, { wins: 1, losses: 0, draws: 0 });
});

// ---------- 保存できない環境 ----------

test('localStorage が使えなくてもメモリ上で動き続ける', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  const store = createStore(broken);
  store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
  store.finishMatch({ outcome: 'draw', reason: 'no-attack', rounds: 3 });
  assert.equal(store.load().record.cpu.draws, 1);
});

test('storage が null でも動く', () => {
  const store = createStore(null);
  store.beginMatch({ mode: 'cpu', cpuId: 'easy' });
  assert.equal(store.load().activeMatch.cpuId, 'easy');
});

// ---------- 勝率 ----------

test('勝率は 勝ち ÷ 全試合（引き分けを含む）、0試合なら null', () => {
  assert.equal(winRate({ wins: 0, losses: 0, draws: 0 }), null);
  assert.equal(winRate({ wins: 1, losses: 2, draws: 1 }), 0.25);
  assert.equal(winRate({ wins: 3, losses: 0, draws: 0 }), 1);
});

// ---------- フレンド戦（Ver.0.2） ----------

test('friend の戦績・履歴は cpu / ranked と分けて保存し、レートは変えない', () => {
  const store = createStore(memoryStorage({ [KEY]: JSON.stringify({ ...createDefaultSave(), rating: { ranked: 1500 } }) }));
  store.beginMatch({ mode: 'friend', opponentName: 'たろう' });
  const entry = store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 6 });
  const save = store.load();
  assert.deepEqual(save.record.friend, { wins: 1, losses: 0, draws: 0 });
  assert.deepEqual(save.record.cpu, { wins: 0, losses: 0, draws: 0 });
  assert.equal(save.history.friend.length, 1);
  assert.equal(entry.opponentName, 'たろう');
  assert.equal(save.rating.ranked, 1500);
});

test('過去データに friend が無くても既定値で補う（互換性）', () => {
  const old = { version: 1, rating: { ranked: null }, record: { cpu: { wins: 3, losses: 1, draws: 0 }, ranked: { wins: 0, losses: 0, draws: 0 } }, history: { cpu: [], ranked: [] }, activeMatch: null };
  const save = createStore(memoryStorage({ [KEY]: JSON.stringify(old) })).load();
  assert.deepEqual(save.record.friend, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.history.friend, []);
  assert.deepEqual(save.record.cpu, { wins: 3, losses: 1, draws: 0 });
});

test('フレンド戦の途中離脱は、次回起動時に負けとして記録しない（フラグだけ下ろす）', () => {
  const storage = memoryStorage();
  createStore(storage).beginMatch({ mode: 'friend', opponentName: 'はなこ' });
  assert.equal(createStore(storage).recoverAbandonedMatch(), null);
  const save = createStore(storage).load();
  assert.equal(save.activeMatch, null);
  assert.deepEqual(save.record.friend, { wins: 0, losses: 0, draws: 0 });
});

test('試合中止（cancelMatch）は勝敗を記録しない', () => {
  const store = createStore();
  store.beginMatch({ mode: 'friend' });
  store.cancelMatch();
  const save = store.load();
  assert.equal(save.activeMatch, null);
  assert.deepEqual(save.record.friend, { wins: 0, losses: 0, draws: 0 });
  assert.equal(store.finishMatch({ outcome: 'win', reason: 'ko', rounds: 1 }), null, '中止後は記録できない');
});
