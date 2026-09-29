// 操作テスト：フレンド戦の再読み込みからの復帰と「やめる」。
// 対戦中にゲストの画面を再読み込み → 同じ対戦に復帰し、次の ROUND がホストと揃う → ゲストが「やめる」
// → ホストは勝利（相手が途中でやめた）、ゲストは敗北。

import { check, sleep, waitFor, buttonOf, bannerText, promptOf } from './lib.js';

async function loadProfile(frame, profile) {
  frame.src = `../../index.html?profile=${profile}`;
  await new Promise((r) => { frame.onload = r; });
  return frame.contentWindow;
}

export async function runFriendRejoin(frameHost, frameGuest) {
  const host = await loadProfile(frameHost, 'e2e-rj-host');
  let guest = await loadProfile(frameGuest, 'e2e-rj-guest');
  await waitFor(() => host.document.querySelector('.menu .btn') && guest.document.querySelector('.menu .btn'));
  const hd = host.document;

  try {
    buttonOf(host, 'フレンド対戦').click();
    await waitFor(() => buttonOf(host, '部屋を作る'));
    buttonOf(host, '部屋を作る').click();
    const code = await waitFor(() => hd.querySelector('.lobby-code')?.textContent);
    buttonOf(guest, 'フレンド対戦').click();
    await waitFor(() => guest.document.querySelector('.lobby-input--code'));
    guest.document.querySelector('.lobby-input--code').value = code;
    buttonOf(guest, '参加する').click();
    await waitFor(() => buttonOf(host, '準備OK') && !buttonOf(host, '準備OK').disabled);
    buttonOf(host, '準備OK').click();
    await waitFor(() => buttonOf(guest, '準備OK') && !buttonOf(guest, '準備OK').disabled);
    buttonOf(guest, '準備OK').click();
    await waitFor(() => hd.querySelector('.screen--battle') && guest.document.querySelector('.screen--battle'), 5000);

    // ROUND 1 の FIGHT! 後にゲストを再読み込み
    await waitFor(() => !promptOf(host).includes('？') && promptOf(host).length === 2, 8000);
    frameGuest.contentWindow.location.reload();
    await new Promise((r) => { frameGuest.onload = r; });
    guest = frameGuest.contentWindow;
    await waitFor(() => guest.document.querySelector('.screen--battle'), 5000);
    check('[復帰] 再読み込みしたゲストが同じ対戦に復帰する', guest.document.querySelector('.battle-bar__title').textContent.includes(code));

    // 次の ROUND が両画面で揃って始まる（ROUND 1 は両者時間切れになるまで待つ）
    const hostRound2 = await waitFor(() => (bannerText(host) === 'ROUND 2' ? Date.now() : 0), 25000, 5);
    const guestRound2 = await waitFor(() => (bannerText(guest) === 'ROUND 2' ? Date.now() : 0), 1000, 5);
    check('[復帰] 復帰後の ROUND 2 が両画面で揃って始まる', Math.abs(hostRound2 - guestRound2) <= 60, `${Math.abs(hostRound2 - guestRound2)}ms`);

    // ゲストが「やめる」
    await sleep(300);
    const original = guest.confirm;
    guest.confirm = () => true;
    buttonOf(guest, 'やめる').click();
    guest.confirm = original;
    await waitFor(() => hd.querySelector('.screen--result') && guest.document.querySelector('.screen--result'), 5000);
    const hostText = hd.querySelector('.screen--result').innerText;
    const guestText = guest.document.querySelector('.screen--result').innerText;
    check('[やめる] やめた側は敗北、相手は勝利（相手が途中でやめた）', guestText.includes('敗北') && hostText.includes('勝利') && hostText.includes('相手が途中でやめた'), `${hostText.split('\n')[0]} / ${guestText.split('\n')[0]}`);
    const save = JSON.parse(localStorage.getItem('kotodama.save.e2e-rj-guest'));
    check('[やめる] やめた側の record.friend に負けが1つ記録される', save?.record.friend.losses === 1, JSON.stringify(save?.record.friend));
  } catch (error) {
    check('[復帰] 実行中にエラー', false, error.message);
  }
}
