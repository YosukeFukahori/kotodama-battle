// 操作テスト：フレンド戦の再読み込みからの復帰と「やめる」。
// 対戦中にゲスト、次にホスト（審判役）の画面を再読み込み → どちらも同じ対戦に復帰し、次の ROUND が揃う → ゲストが「やめる」
// → ホストは勝利（相手が途中でやめた）、ゲストは敗北。

import { check, sleep, waitFor, buttonOf, bannerText, promptOf } from './lib.js';
import { appQuery } from './friendMatch.js';

async function loadProfile(frame, profile, role) {
  frame.src = `../../index.html${appQuery(profile, role)}`;
  await new Promise((r) => { frame.onload = r; });
  return frame.contentWindow;
}

export async function runFriendRejoin(frameHost, frameGuest) {
  const host = await loadProfile(frameHost, 'e2e-rj-host', 'host');
  let guest = await loadProfile(frameGuest, 'e2e-rj-guest', 'guest');
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
    await waitFor(() => hd.querySelector('.screen--battle') && guest.document.querySelector('.screen--battle'), 5000);

    // ROUND 1 の FIGHT! 後にゲストを再読み込み
    await waitFor(() => !promptOf(host).includes('？') && promptOf(host).length === 2, 8000);
    frameGuest.contentWindow.location.reload();
    await new Promise((r) => { frameGuest.onload = r; });
    guest = frameGuest.contentWindow;
    await waitFor(() => guest.document.querySelector('.screen--battle'), 15000);
    check('[復帰] 再読み込みしたゲストが同じ対戦に復帰する', guest.document.querySelector('.battle-bar__title').textContent.includes(code));

    // 次の ROUND が両画面で揃って始まる（ROUND 1 は両者時間切れになるまで待つ）
    const hostRound2 = await waitFor(() => (bannerText(host) === 'ROUND 2' ? Date.now() : 0), 25000, 5);
    const guestRound2 = await waitFor(() => (bannerText(guest) === 'ROUND 2' ? Date.now() : 0), 1000, 5);
    check('[復帰] 復帰後の ROUND 2 が両画面で揃って始まる', Math.abs(hostRound2 - guestRound2) <= 100, `${Math.abs(hostRound2 - guestRound2)}ms`);

    // ROUND 2 の FIGHT! 後にホスト（審判役）を再読み込み → 戻ったホストが判定を続け、ROUND 3 が揃う
    await waitFor(() => !promptOf(host).includes('？') && promptOf(host).length === 2, 8000);
    frameHost.contentWindow.location.reload();
    await new Promise((r) => { frameHost.onload = r; });
    const host2 = frameHost.contentWindow;
    await waitFor(() => host2.document.querySelector('.screen--battle'), 15000);
    check('[復帰] 再読み込みしたホストが同じ対戦に復帰する', host2.document.querySelector('.battle-bar__title').textContent.includes(code));
    const hostRound3 = await waitFor(() => (bannerText(host2) === 'ROUND 3' ? Date.now() : 0), 25000, 5);
    const guestRound3 = await waitFor(() => (bannerText(guest) === 'ROUND 3' ? Date.now() : 0), 1000, 5);
    check('[復帰] ホスト復帰後も判定が続き、ROUND 3 が両画面で揃う', Math.abs(hostRound3 - guestRound3) <= 100, `${Math.abs(hostRound3 - guestRound3)}ms`);

    // ゲストが「やめる」
    await sleep(300);
    const original = guest.confirm;
    guest.confirm = () => true;
    buttonOf(guest, 'やめる').click();
    guest.confirm = original;
    const hd2 = host2.document;
    await waitFor(() => hd2.querySelector('.screen--result') && guest.document.querySelector('.screen--result'), 5000);
    const hostText = hd2.querySelector('.screen--result').innerText;
    const guestText = guest.document.querySelector('.screen--result').innerText;
    check('[やめる] やめた側は敗北、相手は勝利（相手が途中でやめた）', guestText.includes('敗北') && hostText.includes('勝利') && hostText.includes('相手が途中でやめた'), `${hostText.split('\n')[0]} / ${guestText.split('\n')[0]}`);
    const save = JSON.parse(localStorage.getItem('kotodama.save.e2e-rj-guest'));
    check('[やめる] やめた側の record.friend に負けが1つ記録される', save?.record.friend.losses === 1, JSON.stringify(save?.record.friend));
  } catch (error) {
    check('[復帰] 実行中にエラー', false, error.message);
  }
}
