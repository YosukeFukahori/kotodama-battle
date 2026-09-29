// 操作テスト：CPU戦を1試合最後まで通し、演出の時刻・3秒固定の進行・HP・決着・戦績記録を確認する。
// プレイヤーは各ラウンドで公式辞書の長い言葉をすぐ答える（早く決着させるため）。

import { check, sleep, waitFor, loadApp, buttonOf, bannerText, promptOf, wordsFor, answer, SAVE_KEY } from './lib.js';

const TOL = 80; // タイマーの誤差の許容（ms）

export async function runCpuMatch(frame) {
  const win = await loadApp(frame);
  const doc = win.document;
  const before = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')?.record?.cpu ?? { wins: 0, losses: 0, draws: 0 };

  // 画面の変化を時刻つきで記録する
  const events = [];
  const observer = new win.MutationObserver(() => {
    const banner = bannerText(win);
    const judge = doc.querySelector('.judge');
    const state = `${banner}|${judge && !judge.hidden ? 'judge' : ''}`;
    if (events.at(-1)?.state !== state) events.push({ t: performance.now(), banner, judge: judge && !judge.hidden, state });
  });

  try {
    buttonOf(win, 'バトル').click();
    await waitFor(() => doc.querySelector('.cpu-card--easy'));
    doc.querySelector('.cpu-card--easy').click();
    await waitFor(() => buttonOf(win, 'スタート') && !buttonOf(win, 'スタート').disabled);
    observer.observe(doc.getElementById('app'), { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    buttonOf(win, 'スタート').click();

    let rounds = 0;
    const hpLog = [];
    while (rounds < 12) {
      await waitFor(() => doc.querySelector('.screen--result') || (!doc.querySelector('.answer-input')?.disabled && promptOf(win).length === 2 && !promptOf(win).includes('？')), 20000);
      if (doc.querySelector('.screen--result')) break;
      rounds += 1;
      const words = await wordsFor(promptOf(win));
      await answer(win, words.find((w) => w.length <= 20) ?? words[0] ?? 'あぬぬ');
      await waitFor(() => !doc.querySelector('.judge').hidden, 20000);
      hpLog.push([...doc.querySelectorAll('.fighter__hp')].map((e) => e.textContent).join(' / '));
    }
    await waitFor(() => doc.querySelector('.screen--result'), 8000);
    observer.disconnect();

    // --- 演出の時刻 ---
    const gaps = { roundToReady: [], readyToFight: [], judgeToRound: [] };
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const cur = events[i];
      const dt = cur.t - prev.t;
      if (prev.banner.startsWith('ROUND') && cur.banner === 'READY') gaps.roundToReady.push(dt);
      if (prev.banner === 'READY' && cur.banner === 'FIGHT!') gaps.readyToFight.push(dt);
    }
    const judgeShown = events.filter((e, i) => e.judge && !events[i - 1]?.judge);
    const roundStarts = events.filter((e) => e.banner.startsWith('ROUND'));
    for (const j of judgeShown) {
      const next = roundStarts.find((r) => r.t > j.t);
      if (next) gaps.judgeToRound.push(next.t - j.t);
    }
    const within = (arr, target) => arr.length > 0 && arr.every((v) => Math.abs(v - target) <= TOL);
    const fmt = (arr) => arr.map((v) => Math.round(v)).join(', ');
    check('[CPU] ROUND → READY は約0.7秒', within(gaps.roundToReady, 700), fmt(gaps.roundToReady));
    check('[CPU] READY → FIGHT! は約0.7秒', within(gaps.readyToFight, 700), fmt(gaps.readyToFight));
    check('[CPU] 判定表示 → 次の ROUND は3秒固定', within(gaps.judgeToRound, 3000), fmt(gaps.judgeToRound));

    // --- 決着と記録 ---
    const resultText = doc.querySelector('.screen--result').innerText;
    const after = JSON.parse(localStorage.getItem(SAVE_KEY)).record.cpu;
    check('[CPU] 1試合最後まで進んで結果画面になる', /勝利|敗北|引き分け/.test(resultText), `${rounds}ラウンド`);
    check('[CPU] 決着時のHP表示にどちらかの0がある（KO）', /(^| )0 \//.test(hpLog.at(-1) ?? ''), hpLog.at(-1));
    const total = (r) => r.wins + r.losses + r.draws;
    check('[CPU] 戦績（record.cpu）に1試合記録される', total(after) === total(before) + 1, JSON.stringify(after));
    check('[CPU] 結果画面に「レートは変動しません」', resultText.includes('レートは変動しません'));
  } catch (error) {
    check('[CPU] 実行中にエラー', false, error.message);
  }
}
