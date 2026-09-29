// 操作テスト：FIGHT! 前に入力欄を触っても、FIGHT! 後に正常に入力・送信できること。
// 実際のアプリを iframe で動かす（ブラウザ専用。http://localhost:8000/tests/e2e/ を開く）。
//
// 手順
//   1. ROUND 中に入力欄を複数回タップ（pointerdown / touchstart / mousedown / click / focus）＋ IME 開始イベント
//   2. READY 中にも同様にタップ
//   3. FIGHT! 開始を待つ
//   4. 入力欄をタップ
//   5. かなを入力できる
//   6. 回答を送信できる
// 戦績への影響を残さないよう、最後にバトルをやめ、localStorage を元に戻す。

const SAVE_KEY = 'kotodama.save';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 8000, stepMs = 10) {
  const until = performance.now() + timeoutMs;
  while (performance.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(stepMs);
  }
  throw new Error('タイムアウト');
}

function tap(win, el) {
  const opts = { bubbles: true, cancelable: true, view: win };
  el.dispatchEvent(new win.PointerEvent('pointerdown', { ...opts, pointerType: 'touch' }));
  try { el.dispatchEvent(new win.TouchEvent('touchstart', opts)); } catch { /* TouchEvent 非対応環境 */ }
  el.dispatchEvent(new win.MouseEvent('mousedown', opts));
  el.dispatchEvent(new win.PointerEvent('pointerup', { ...opts, pointerType: 'touch' }));
  el.dispatchEvent(new win.MouseEvent('mouseup', opts));
  el.click();
  el.focus();
}

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
  check(`${stage}：入力欄は disabled`, s.disabled);
  check(`${stage}：入力欄にフォーカスが当たらない`, !s.focused);
  check(`${stage}：入力欄は pointer-events: none`, s.pointerEvents === 'none', s.pointerEvents);
  check(`${stage}：回答ボタンは disabled`, s.submitDisabled);
  check(`${stage}：回答ボタンは pointer-events: none`, s.submitPointerEvents === 'none', s.submitPointerEvents);
  check(`${stage}：お題はまだ伏せ字`, s.prompt === '？？', s.prompt);
}

async function run() {
  const backup = localStorage.getItem(SAVE_KEY);
  const frame = document.getElementById('app');
  frame.src = '../../index.html';
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow;
  const doc = win.document;
  const btn = (text) => [...doc.querySelectorAll('button')].find((b) => b.textContent === text);

  try {
    await waitFor(() => doc.querySelector('.menu .btn'));
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
    check('FIGHT!：入力欄が有効になる', !atFight.disabled);
    check('FIGHT!：pointer-events が戻る', atFight.pointerEvents !== 'none', atFight.pointerEvents);
    check('FIGHT!：お題が表示される', atFight.prompt.length === 2 && !atFight.prompt.includes('？'), atFight.prompt);

    // 4. 入力欄をタップ
    tap(win, input);
    check('FIGHT!後：タップで入力欄にフォーカスできる', doc.activeElement === input);

    // 5. かな入力（IME 変換 → 確定の流れも再現）
    input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 'てすと';
    input.dispatchEvent(new win.InputEvent('input', { bubbles: true, isComposing: true }));
    input.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: 'てすと' }));
    input.dispatchEvent(new win.InputEvent('input', { bubbles: true }));
    check('FIGHT!後：かなを入力できる', input.value === 'てすと', input.value);
    check('FIGHT!後：回答ボタンが押せる状態になる', !submit.disabled);

    // 6. 回答を送信（変換確定から少し待ってから）
    await sleep(150);
    submit.click();
    await sleep(50);
    const status = doc.querySelector('.answer-status').textContent;
    check('回答を送信できる（回答済みになる）', submit.textContent === '回答済み ✓', submit.textContent);
    check('送信後は入力欄が操作不能になる', input.disabled && inputState(win).pointerEvents === 'none');
    check('回答状況に「あなた 回答済み ✓」が出る', status.includes('あなた 回答済み ✓'), status);
  } catch (error) {
    check('実行中にエラー', false, error.message);
  } finally {
    // 後片付け：バトルをやめて、戦績を元に戻す
    const quit = btn('やめる');
    if (quit) {
      const original = win.confirm;
      win.confirm = () => true;
      quit.click();
      win.confirm = original;
    }
    await sleep(100);
    if (backup === null) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, backup);
  }

  const failed = results.filter((r) => !r.ok);
  const summary = `${results.length - failed.length}/${results.length} passed`;
  document.getElementById('results').textContent = results
    .map((r) => (r.ok ? `✓ ${r.name}` : `✗ ${r.name}${r.detail ? `\n    ${r.detail}` : ''}`))
    .concat('', summary)
    .join('\n');
  document.body.dataset.status = failed.length ? 'fail' : 'pass';
  document.title = `${failed.length ? '✗' : '✓'} ${summary}`;
  window.e2eResults = results;
}

run();
