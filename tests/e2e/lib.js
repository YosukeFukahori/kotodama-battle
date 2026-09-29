// 操作テスト（ブラウザ専用）の共通部品。

export const SAVE_KEY = 'kotodama.save';
export const results = [];

export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail ?? '') });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, timeoutMs = 8000, stepMs = 10) {
  const until = performance.now() + timeoutMs;
  while (performance.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(stepMs);
  }
  throw new Error('タイムアウト');
}

/** iframe にアプリを読み込む。query は '?profile=host' など */
export async function loadApp(frame, query = '') {
  frame.src = `../../index.html${query}`;
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow;
  await waitFor(() => win.document.querySelector('.menu .btn'));
  return win;
}

export const buttonOf = (win, text) => [...win.document.querySelectorAll('button')].find((b) => b.textContent === text);

export function tap(win, el) {
  const opts = { bubbles: true, cancelable: true, view: win };
  el.dispatchEvent(new win.PointerEvent('pointerdown', { ...opts, pointerType: 'touch' }));
  try { el.dispatchEvent(new win.TouchEvent('touchstart', opts)); } catch { /* TouchEvent 非対応環境 */ }
  el.dispatchEvent(new win.MouseEvent('mousedown', opts));
  el.dispatchEvent(new win.PointerEvent('pointerup', { ...opts, pointerType: 'touch' }));
  el.dispatchEvent(new win.MouseEvent('mouseup', opts));
  el.click();
  el.focus();
}

export function bannerText(win) {
  const b = win.document.querySelector('.round-banner');
  return b && !b.hidden ? b.textContent : '';
}

export function promptOf(win) {
  return [...win.document.querySelectorAll('.prompt__char')].map((e) => e.textContent).join('');
}

const hex = (c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/** お題に合う公式辞書の語（長い順）。回答に使う */
export async function wordsFor(prompt) {
  const [first, last] = [...prompt];
  const res = await fetch(`../../data/official/${hex(first)}-${hex(last)}.json`);
  if (!res.ok) return [];
  return (await res.json()).entries.map((e) => e[0]).sort((a, b) => b.length - a.length);
}

/** 入力欄に文字を入れて送信する（IME 変換→確定の流れを再現） */
export async function answer(win, text) {
  const input = win.document.querySelector('.answer-input');
  tap(win, input);
  input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }));
  input.value = text;
  input.dispatchEvent(new win.InputEvent('input', { bubbles: true, isComposing: true }));
  input.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: text }));
  input.dispatchEvent(new win.InputEvent('input', { bubbles: true }));
  await sleep(120);
  win.document.querySelector('.answer-submit').click();
}

export function quitBattle(win) {
  const quit = buttonOf(win, 'やめる');
  if (!quit) return;
  const original = win.confirm;
  win.confirm = () => true;
  quit.click();
  win.confirm = original;
}

export function render() {
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
