// 操作テスト：相手の切断が20秒続いたら試合中止（勝敗は記録しない）。
// 対戦中にゲストの画面を閉じる → ホストに「接続待ち」 → 約20秒後に「試合中止」。

import { check, waitFor, buttonOf } from './lib.js';
import { appQuery } from './friendMatch.js';

async function loadProfile(frame, profile, role) {
  frame.src = `../../index.html${appQuery(profile, role)}`;
  await new Promise((r) => { frame.onload = r; });
  return frame.contentWindow;
}

export async function runFriendAbort(frameHost, frameGuest) {
  const host = await loadProfile(frameHost, 'e2e-ab-host', 'host');
  const guest = await loadProfile(frameGuest, 'e2e-ab-guest', 'guest');
  await waitFor(() => host.document.querySelector('.menu .btn') && guest.document.querySelector('.menu .btn'));
  const hd = host.document;
  try {
    buttonOf(host, 'フレンド対戦').click();
    await waitFor(() => buttonOf(host, '部屋を作る'), 15000);
    buttonOf(host, '部屋を作る').click();
    const code = await waitFor(() => hd.querySelector('.lobby-code')?.textContent);
    buttonOf(guest, 'フレンド対戦').click();
    await waitFor(() => guest.document.querySelector('.lobby-input--code'), 15000);
    guest.document.querySelector('.lobby-input--code').value = code;
    buttonOf(guest, '参加する').click();
    await waitFor(() => buttonOf(host, '準備OK') && !buttonOf(host, '準備OK').disabled);
    buttonOf(host, '準備OK').click();
    await waitFor(() => buttonOf(guest, '準備OK') && !buttonOf(guest, '準備OK').disabled);
    buttonOf(guest, '準備OK').click();
    await waitFor(() => hd.querySelector('.screen--battle'), 8000);

    // ゲストの画面を閉じる（タブを閉じた・通信が切れたのと同じ）
    const closedAt = Date.now();
    frameGuest.src = 'about:blank';
    const noticeAt = await waitFor(() => (hd.querySelector('.battle-message')?.textContent.includes('接続が切れました') ? Date.now() : 0), 15000);
    check('[切断] 相手が切断するとホストに「接続待ち」が表示される', true, `${Math.round((noticeAt - closedAt) / 100) / 10}秒後`);
    const endedAt = await waitFor(() => (hd.querySelector('.screen--result') ? Date.now() : 0), 40000);
    const resultText = hd.querySelector('.screen--result').innerText;
    const sec = (endedAt - closedAt) / 1000;
    check('[切断] 復帰しないまま約20秒で試合中止になる', resultText.includes('試合中止') && sec >= 19 && sec <= 30, `${sec.toFixed(1)}秒後・${resultText.split('\n')[0]}`);
    const save = JSON.parse(localStorage.getItem('kotodama.save.e2e-ab-host') ?? 'null');
    const f = save?.record.friend;
    check('[切断] 中止試合は勝敗を記録しない', f && f.wins + f.losses + f.draws === 0 && !save.activeMatch, JSON.stringify(f));
  } catch (error) {
    check('[切断] 実行中にエラー', false, error.message);
  }
}
