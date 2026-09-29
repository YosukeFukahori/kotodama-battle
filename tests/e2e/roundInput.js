// 操作テスト：FIGHT! 前に入力欄を触っても、FIGHT! 後に正常に入力・送信できること。
//
// 手順
//   1. ROUND 中に入力欄を複数回タップ（pointerdown / touchstart / mousedown / click / focus）＋ IME 開始イベント
//   2. READY 中にも同様にタップ
//   3. FIGHT! 開始を待つ
//   4. 入力欄をタップ
//   5. かなを入力できる
//   6. 回答を送信できる

import { check, sleep, waitFor, tap, loadApp, buttonOf, quitBattle } from './lib.js';

function inputState(win) {
  const doc = win.document;
  const input = doc.querySelector('.answer-input');
  const submit = doc.querySelector('.answer-submit');
  const banner = doc.querySelector('.round-banner');
  return {
    input,
    submit,
    banner: banner.hidden ? '' : banner.textContent,
    disabled: input.disabled,
    focused: doc.activeElement === input,
    pointerEvents: win.getComputedStyle(input).pointerEvents,
    submitPointerEvents: win.getComputedStyle(submit).pointerEvents,
    submitDisabled: submit.disabled,
    prompt: [...doc.querySelectorAll('.prompt__char')].map((e) => e.textContent).join(''),
  };
}

/** FIGHT! 前（ROUND / READY）の状態を確認する */
function expectLocked(win, stage) {
  const s = inputState(win);
  check(`[入力] ${stage}：入力欄は disabled`, s.disabled);
  check(`[入力] ${stage}：入力欄にフォーカスが当たらない`, !s.focused);
  check(`[入力] ${stage}：入力欄は pointer-events: none`, s.pointerEvents === 'none', s.pointerEvents);
  check(`[入力] ${stage}：回答ボタンは disabled`, s.submitDisabled);
  check(`[入力] ${stage}：回答ボタンは pointer-events: none`, s.submitPointerEvents === 'none', s.submitPointerEvents);
  check(`[入力] ${stage}：お題はまだ伏せ字`, s.prompt === '？？', s.prompt);
}

export async function runRoundInput(frame) {
  const win = await loadApp(frame);
  const doc = win.document;
  const btn = (text) => buttonOf(win, text);

  try {
    btn('バトル').click();
    await waitFor(() => doc.querySelector('.cpu-card--easy'));
    doc.querySelector('.cpu-card--easy').click();
    await waitFor(() => btn('スタート') && !btn('スタート').disabled);
    btn('スタート').click();

    // 1. ROUND 中に複数回タップ ＋ IME 開始
    await waitFor(() => inputState(win).banner.startsWith('ROUND'));
    const { input, submit } = inputState(win);
    for (let i = 0; i < 3; i += 1) {
      tap(win, input);
      tap(win, submit);
      input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true, data: 'あ' }));
      await sleep(60);
    }
    expectLocked(win, 'ROUND中');

    // 2. READY 中にもタップ ＋ IME 開始（変換中のまま FIGHT! を迎えるケース）
    await waitFor(() => inputState(win).banner === 'READY');
    for (let i = 0; i < 3; i += 1) {
      tap(win, input);
      input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true, data: 'か' }));
      await sleep(60);
    }
    expectLocked(win, 'READY中');

    // 3. FIGHT! 開始
    await waitFor(() => !inputState(win).disabled);
    const atFight = inputState(win);
    check('[入力] FIGHT!：入力欄が有効になる', !atFight.disabled);
    check('[入力] FIGHT!：pointer-events が戻る', atFight.pointerEvents !== 'none', atFight.pointerEvents);
    check('[入力] FIGHT!：お題が表示される', atFight.prompt.length === 2 && !atFight.prompt.includes('？'), atFight.prompt);

    // 4. 入力欄をタップ
    tap(win, input);
    check('[入力] FIGHT!後：タップで入力欄にフォーカスできる', doc.activeElement === input);

    // 5. かな入力（IME 変換 → 確定の流れも再現）
    input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 'てすと';
    input.dispatchEvent(new win.InputEvent('input', { bubbles: true, isComposing: true }));
    input.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: 'てすと' }));
    input.dispatchEvent(new win.InputEvent('input', { bubbles: true }));
    check('[入力] FIGHT!後：かなを入力できる', input.value === 'てすと', input.value);
    check('[入力] FIGHT!後：回答ボタンが押せる状態になる', !submit.disabled);

    // 6. 回答を送信（変換確定から少し待ってから）
    await sleep(150);
    submit.click();
    await sleep(50);
    const status = doc.querySelector('.answer-status').textContent;
    check('[入力] 回答を送信できる（回答済みになる）', submit.textContent === '回答済み ✓', submit.textContent);
    check('[入力] 送信後は入力欄が操作不能になる', input.disabled && inputState(win).pointerEvents === 'none');
    check('[入力] 回答状況に「あなた 回答済み ✓」が出る', status.includes('あなた 回答済み ✓'), status);
  } catch (error) {
    check('[入力] 実行中にエラー', false, error.message);
  } finally {
    quitBattle(win);
    await sleep(100);
  }
}
