// 操作テストの入口（ブラウザ専用。http://localhost:8000/tests/e2e/ を開く）。
// 戦績データ（localStorage）は実行前に退避し、終了後に元へ戻す。

import { render, check } from './lib.js';
import { runRoundInput } from './roundInput.js';
import { runCpuMatch } from './cpuMatch.js';

const KEYS_PREFIX = 'kotodama.';
const frame = document.getElementById('app');

function backupStorage() {
  const saved = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key.startsWith(KEYS_PREFIX)) saved[key] = localStorage.getItem(key);
  }
  return saved;
}

function restoreStorage(saved) {
  for (const key of Object.keys(localStorage)) if (key.startsWith(KEYS_PREFIX)) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
}

const only = new URLSearchParams(location.search).get('only'); // ?only=cpu などで1つだけ実行
const scenarios = [
  ['input', runRoundInput],
  ['cpu', runCpuMatch],
];

const saved = backupStorage();
try {
  for (const [name, run] of scenarios) {
    if (only && only !== name) continue;
    document.getElementById('running').textContent = `実行中：${name}`;
    await run(frame);
  }
} catch (error) {
  check('実行中にエラー', false, error.message);
} finally {
  frame.src = 'about:blank';
  restoreStorage(saved);
  document.getElementById('running').textContent = '';
  render();
}
