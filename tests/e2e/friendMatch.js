// 操作テスト：2画面（ホスト・ゲスト）でフレンド対戦を1試合最後まで通す（通信なしの LocalRoomStore）。
// ロビー（部屋作成・6桁コード・参加・準備OK）→ 同期した ROUND / READY / FIGHT! → 判定 → 3秒で次へ → 決着 → 戦績。
// 2つの iframe は ?profile= で別の端末として動く（時刻比較は両方で共通の Date.now() を使う）。

import { check, sleep, waitFor, buttonOf, bannerText, promptOf, wordsFor, answer } from './lib.js';

const SYNC_TOL = 100;  // 2画面の表示タイミングのずれの許容（ms。Firebase の時刻合わせの誤差を含む）
const GAP_TOL = 100;   // 判定表示 → 次の ROUND（3秒）の許容（ms）

/** 親ページの ?store= / ?latencyHost= / ?latencyGuest= を iframe に引き継ぐ */
export function appQuery(profile, role) {
  const parent = new URLSearchParams(location.search);
  const q = new URLSearchParams({ profile });
  if (parent.get('store')) q.set('store', parent.get('store'));
  const latency = parent.get(role === 'host' ? 'latencyHost' : 'latencyGuest');
  if (latency) q.set('latency', latency);
  return `?${q}`;
}

async function loadProfile(frame, profile, role) {
  frame.src = `../../index.html${appQuery(profile, role)}`;
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow;
  await waitFor(() => win.document.querySelector('.menu .btn'));
  return win;
}

function recordTimeline(win) {
  const events = [];
  const observer = new win.MutationObserver(() => {
    const banner = bannerText(win);
    const judge = win.document.querySelector('.judge');
    const state = `${banner}|${judge && !judge.hidden ? 'judge' : ''}`;
    if (events.at(-1)?.state !== state) events.push({ t: Date.now(), banner, judge: Boolean(judge && !judge.hidden), state });
  });
  observer.observe(win.document.getElementById('app'), { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  return { events, stop: () => observer.disconnect() };
}

const firstTimes = (events, pred) => events.filter((e, i) => pred(e) && !(i > 0 && pred(events[i - 1]))).map((e) => e.t);

export async function runFriendMatch(frameHost, frameGuest) {
  const host = await loadProfile(frameHost, 'e2e-host', 'host');
  const guest = await loadProfile(frameGuest, 'e2e-guest', 'guest');
  const hd = host.document;
  const gd = guest.document;

  try {
    // --- ロビー：部屋を作る ---
    buttonOf(host, 'フレンド対戦').click();
    await waitFor(() => hd.querySelector('.lobby-input'), 15000);
    hd.querySelector('.lobby-input').value = 'ホストさん';
    buttonOf(host, '部屋を作る').click();
    const code = await waitFor(() => hd.querySelector('.lobby-code')?.textContent);
    check('[フレンド] 部屋を作ると6桁の部屋コードが表示される', /^\d{6}$/.test(code), code);

    // --- ロビー：コードで参加（名前は空欄 → 既定名） ---
    buttonOf(guest, 'フレンド対戦').click();
    await waitFor(() => gd.querySelector('.lobby-input--code'), 15000);
    gd.querySelector('.lobby-input--code').value = code;
    buttonOf(guest, '参加する').click();
    await waitFor(() => gd.querySelector('.lobby-code')?.textContent === code);
    await waitFor(() => hd.querySelectorAll('.lobby-player__name')[1]?.textContent.startsWith('プレイヤー'));
    const hostNames = [...hd.querySelectorAll('.lobby-player__name')].map((e) => e.textContent).join(' / ');
    check('[フレンド] コード入力で参加でき、両画面に2人が表示される（空欄の名前は既定名）', /ホストさん.*プレイヤー\d{4}/.test(hostNames), hostNames);

    // --- 準備OK：片方だけでは始まらない ---
    buttonOf(host, '準備OK').click();
    await sleep(400);
    check('[フレンド] 片方だけの準備OKでは開始しない', Boolean(hd.querySelector('.screen--lobby')));
    const timelines = {};
    buttonOf(guest, '準備OK').click();
    await waitFor(() => hd.querySelector('.screen--battle') && gd.querySelector('.screen--battle'), 5000);
    check('[フレンド] 両者の準備OKで両画面が対戦画面になる', true);
    timelines.host = recordTimeline(host);
    timelines.guest = recordTimeline(guest);

    // --- 対戦：ホストは長い言葉、ゲストは短い言葉（1ラウンドだけ答えない＝時間切れ） ---
    let round = 0;
    const answerIn = async (win, pick) => {
      await waitFor(() => win.document.querySelector('.screen--result') || (!win.document.querySelector('.answer-input')?.disabled && !promptOf(win).includes('？') && promptOf(win).length === 2), 25000);
      if (win.document.querySelector('.screen--result')) return false;
      const words = await wordsFor(promptOf(win));
      const word = pick(words);
      if (word) await answer(win, word);
      return true;
    };
    while (round < 10) {
      round += 1;
      const [h] = await Promise.all([
        answerIn(host, (w) => w.find((x) => x.length >= 6 && x.length <= 12) ?? w[0]),
        answerIn(guest, (w) => (round === 2 ? null : [...w].reverse()[0])),
      ]);
      if (!h) break;
      await waitFor(() => hd.querySelector('.screen--result') || !hd.querySelector('.judge').hidden, 25000);
      if (hd.querySelector('.screen--result')) break;
    }
    await waitFor(() => hd.querySelector('.screen--result') && gd.querySelector('.screen--result'), 10000);
    timelines.host.stop();
    timelines.guest.stop();

    // --- 同期：ROUND / READY / FIGHT! / 判定の表示タイミングが両画面で揃う ---
    for (const [label, pred] of [
      ['ROUND', (e) => e.banner.startsWith('ROUND')],
      ['READY', (e) => e.banner === 'READY'],
      ['FIGHT!', (e) => e.banner === 'FIGHT!'],
      ['判定タイム', (e) => e.judge],
    ]) {
      const h = firstTimes(timelines.host.events, pred);
      const g = firstTimes(timelines.guest.events, pred);
      const diffs = h.map((t, i) => (g[i] === undefined ? Infinity : Math.abs(t - g[i])));
      check(`[フレンド] ${label} の表示が両画面で同時（ずれ ${SYNC_TOL}ms 以内）`, h.length > 0 && h.length === g.length && diffs.every((d) => d <= SYNC_TOL), `回数 ${h.length}/${g.length}・ずれ ${diffs.map(Math.round).join(', ')}ms`);
    }

    // --- 判定表示から3秒固定で次の ROUND ---
    const judgeTimes = firstTimes(timelines.host.events, (e) => e.judge);
    const roundTimes = firstTimes(timelines.host.events, (e) => e.banner.startsWith('ROUND'));
    const gaps = judgeTimes.map((t) => roundTimes.find((r) => r > t)).map((r, i) => (r ? r - judgeTimes[i] : null)).filter((v) => v !== null);
    check('[フレンド] 判定表示 → 次の ROUND は3秒固定', gaps.length > 0 && gaps.every((v) => Math.abs(v - 3000) <= GAP_TOL), gaps.join(', '));

    // --- 決着・戦績 ---
    const hostResult = hd.querySelector('.result__label').textContent;
    const guestResult = gd.querySelector('.result__label').textContent;
    check('[フレンド] 1試合最後まで進み、勝敗が両画面で対応する', (hostResult === '勝利' && guestResult === '敗北') || (hostResult === '敗北' && guestResult === '勝利') || (hostResult === '引き分け' && guestResult === '引き分け'), `ホスト ${hostResult} / ゲスト ${guestResult}・${round}ラウンド`);
    check('[フレンド] 結果画面に「レートは変動しません」', hd.querySelector('.screen--result').innerText.includes('フレンド戦のため、レートは変動しません'));
    const saveOf = (profile) => JSON.parse(localStorage.getItem(`kotodama.save.${profile}`) ?? 'null');
    const hs = saveOf('e2e-host');
    const gs = saveOf('e2e-guest');
    const total = (r) => (r ? r.wins + r.losses + r.draws : 0);
    check('[フレンド] 両端末の record.friend に1試合ずつ記録（cpu は変わらない）', total(hs?.record.friend) === 1 && total(gs?.record.friend) === 1 && total(hs?.record.cpu) === 0, JSON.stringify({ host: hs?.record.friend, guest: gs?.record.friend }));
    check('[フレンド] 履歴に相手の名前が残る', gs?.history.friend[0]?.opponentName === 'ホストさん', gs?.history.friend[0]?.opponentName);
  } catch (error) {
    check('[フレンド] 実行中にエラー', false, error.message);
  }
}
