// 本物の Firebase でアクセスルールを確認する（ブラウザ専用。http://localhost:8000/tests/live/ を開く）。
// 3人の匿名ユーザー（ホスト・ゲスト・第三者）と、未ログインの接続を用意し、実際に読み書きして許可／拒否を確かめる。
// テスト用の部屋は有効期限を短くして作り、最後に期限切れを待って削除する。

import { FIREBASE_CONFIG } from '../../src/net/firebaseConfig.js';
import { FIREBASE_SDK_VERSION } from '../../src/net/firebase.js';

const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const [appSdk, authSdk, db] = await Promise.all([
  import(`${SDK}/firebase-app.js`),
  import(`${SDK}/firebase-auth.js`),
  import(`${SDK}/firebase-database.js`),
]);

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

async function client(name, signIn) {
  const app = appSdk.getApps().find((a) => a.name === name) ?? appSdk.initializeApp(FIREBASE_CONFIG, name);
  const auth = authSdk.getAuth(app);
  let uid = null;
  if (signIn) {
    await auth.authStateReady();
    if (!auth.currentUser) await authSdk.signInAnonymously(auth);
    uid = auth.currentUser.uid;
  }
  const database = db.getDatabase(app, FIREBASE_CONFIG.databaseURL);
  const ref = (path) => db.ref(database, path);
  return {
    uid,
    set: (path, value) => db.set(ref(path), value),
    update: (path, value) => db.update(ref(path), value),
    get: (path) => db.get(ref(path)),
    offset: () => new Promise((r) => db.onValue(ref('.info/serverTimeOffset'), (s) => r(s.val() ?? 0), { onlyOnce: true })),
  };
}

/** 書き込み（または読み込み）を試して、許可／拒否を返す */
async function attempt(fn) {
  try {
    await fn();
    return 'allowed';
  } catch (e) {
    return /permission|PERMISSION_DENIED/i.test(e.message) ? 'denied' : `error: ${e.message}`;
  }
}

async function expect(name, fn, expected) {
  const got = await attempt(fn);
  check(name, got === expected, got === expected ? '' : `期待 ${expected} / 実際 ${got}`);
}

const host = await client('rules-host', true);
const guest = await client('rules-guest', true);
const other = await client('rules-other', true);
const anon = await client('rules-anon', false);
const now = Date.now() + (await host.offset());
const code = String(100000 + Math.floor(Math.random() * 900000));
const ROOM = `rooms/${code}`;
const TTL = 25_000; // テスト後に削除できるよう、短い有効期限にする
const answer = (input) => ({ status: 'answered', input, timeMs: 1200, submittedAt: now });

try {
  // --- 準備：ホストが部屋を作り、ゲストが参加し、対戦開始 ---
  await expect('準備：ホストが部屋を作れる', () => host.set(ROOM, {
    meta: { code, createdAt: now, expiresAt: now + TTL, status: 'waiting', version: 1 },
    players: { host: { id: host.uid, name: 'H', ready: false, lastSeen: now } },
  }), 'allowed');
  await expect('準備：ゲストが参加できる', () => guest.set(`${ROOM}/players/guest`, { id: guest.uid, name: 'G', ready: false, lastSeen: now }), 'allowed');
  await expect('準備：ゲストが自分の準備OKを押せる', () => guest.set(`${ROOM}/players/guest/ready`, true), 'allowed');
  await expect('準備：ホストが対戦を開始できる（ROUND 1・match・meta）', () => host.update(ROOM, {
    'rounds/1/schedule': { fightAt: now + 2000 },
    'rounds/1/prompt': { first: 'あ', last: 'め' },
    match: { status: 'playing', round: 1, state: { hp: { host: 100, guest: 100 } } },
    'meta/status': 'playing',
  }), 'allowed');

  // --- 回答（1〜4） ---
  await expect('1. ホストが自分の answer を書ける', () => host.set(`${ROOM}/rounds/1/answers/host`, answer('あめ')), 'allowed');
  await expect('2. ホストが guest の answer を書けない', () => host.set(`${ROOM}/rounds/1/answers/guest`, answer('ずる')), 'denied');
  await expect('3. ゲストが自分の answer を書ける', () => guest.set(`${ROOM}/rounds/1/answers/guest`, answer('あめ')), 'allowed');
  await expect('2. ホストが guest の answer を上書きできない', () => host.set(`${ROOM}/rounds/1/answers/guest`, answer('ずる')), 'denied');
  await expect('4. ゲストが host の answer を上書きできない', () => guest.set(`${ROOM}/rounds/1/answers/host`, answer('ずる')), 'denied');
  await expect('追加：回答は1回だけ（自分でも書き換え不可）', () => guest.set(`${ROOM}/rounds/1/answers/guest`, answer('あたため')), 'denied');

  // --- 裁定データ（5・6） ---
  await expect('5. ホストが裁定を一括で書ける（result・state・次ラウンド）', () => host.update(ROOM, {
    'rounds/1/result': { finished: false, revealAt: now + 800, nextRoundAt: now + 3800 },
    'match/state': { hp: { host: 100, guest: 80 } },
    'rounds/2/schedule': { fightAt: now + 5200 },
    'rounds/2/prompt': { first: 'い', last: 'ぬ' },
    'match/round': 2,
  }), 'allowed');
  for (const field of ['schedule', 'prompt', 'result']) {
    await expect(`6. ゲストが ${field} を書けない`, () => guest.set(`${ROOM}/rounds/2/${field}`, { x: 1 }), 'denied');
  }
  await expect('6. ゲストが match/state を書けない', () => guest.set(`${ROOM}/match/state`, { hp: { host: 0, guest: 100 } }), 'denied');

  // --- 参加・未ログイン（7・8） ---
  await expect('7. 3人目がゲスト枠に参加できない', () => other.set(`${ROOM}/players/guest`, { id: other.uid, name: 'X', ready: false, lastSeen: now }), 'denied');
  await expect('7. 3人目が3つ目の枠を作れない', () => other.set(`${ROOM}/players/third`, { id: other.uid, name: 'X' }), 'denied');
  await expect('8. 未ログインは部屋を読めない', () => anon.get(ROOM), 'denied');
  await expect('8. 未ログインは部屋に書けない', () => anon.set(`${ROOM}/players/guest/ready`, false), 'denied');
  await expect('追加：ログイン済みでも部屋の一覧は読めない', () => other.get('rooms'), 'denied');
  await expect('追加：コードを知っている部屋は読める', () => other.get(ROOM), 'allowed');

  // --- 試合状態・勝敗の確定はホストだけ（確定1〜8） ---
  await expect('確定1. ゲストが meta.status を変更できない', () => guest.set(`${ROOM}/meta/status`, 'aborted'), 'denied');
  await expect('確定2. ゲストが match.status を変更できない', () => guest.set(`${ROOM}/match/status`, 'finished'), 'denied');
  await expect('確定3. ゲストが match.result を変更できない', () => guest.set(`${ROOM}/match/result`, { outcome: 'host', reason: 'forfeit', decidedRound: 2 }), 'denied');
  await expect('確定6. 第三者が降参リクエストを書けない', () => other.set(`${ROOM}/signals/forfeit/guest`, { at: now }), 'denied');
  await expect('確定7. ホストがゲストの降参を偽装できない', () => host.set(`${ROOM}/signals/forfeit/guest`, { at: now }), 'denied');
  await expect('確定8. ゲストが中止（aborted）を書けない', () => guest.update(ROOM, { 'match/status': 'aborted', 'meta/status': 'aborted' }), 'denied');
  await expect('確定8. 第三者が中止を書けない', () => other.update(ROOM, { 'match/status': 'aborted', 'meta/status': 'aborted' }), 'denied');
  await expect('確定4. ゲストが自分の降参リクエストを書ける', () => guest.set(`${ROOM}/signals/forfeit/guest`, { at: now, round: 2 }), 'allowed');
  await expect('確定4. 降参リクエストは取り消せない', () => guest.set(`${ROOM}/signals/forfeit/guest`, null), 'denied');
  await expect('確定5. ホストが降参を検知してゲストの敗北を確定できる', () => host.update(ROOM, {
    'match/status': 'finished',
    'match/result': { outcome: 'host', reason: 'forfeit', decidedRound: 2 },
    'meta/status': 'finished',
  }), 'allowed');
  await expect('確定8. ホストは中止（aborted）を書ける', () => host.update(ROOM, { 'match/status': 'aborted', 'meta/status': 'aborted' }), 'allowed');

  // --- 第三者・削除 ---
  await expect('追加：第三者が有効な部屋を削除できない', () => other.set(ROOM, null), 'denied');
  await expect('追加：存在しない部屋にゲスト枠だけ作れない', () => guest.set(`rooms/${code === '999999' ? '999998' : '999999'}/players/guest`, { id: guest.uid, name: 'G' }), 'denied');
} finally {
  // 後片付け：期限切れを待って削除（期限切れの部屋は誰でも削除できる）
  document.getElementById('results').textContent = '後片付け中（テスト用の部屋の期限切れを待って削除）…';
  const waitMs = now + TTL + 1500 - (Date.now() + (await host.offset()));
  await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
  const del = await attempt(() => host.set(ROOM, null));
  check('後片付け：期限切れのテスト用の部屋を削除できる', del === 'allowed', del);
}

const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length}/${results.length} passed（部屋 ${code}）`;
document.getElementById('results').textContent = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `\n    ${r.detail}` : ''}`).concat('', summary).join('\n');
document.body.dataset.status = failed.length ? 'fail' : 'pass';
document.title = `${failed.length ? '✗' : '✓'} ${summary}`;
window.liveResults = results;
