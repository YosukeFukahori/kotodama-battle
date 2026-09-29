// テストランナー。
// ブラウザ：http://localhost:8000/tests/ を開く
// Node（14以上）：node tests/run.js

import { runAll } from './harness.js';

// テストファイルを追加したらここに追記する
import './kana.test.js';
import './dictionary.test.js';
import './wordValidator.test.js';
import './data.test.js';
import './setup.test.js';
import './damage.test.js';
import './prompt.test.js';
import './battle.test.js';
import './judge.test.js';
import './cpuAI.test.js';
import './storage.test.js';
import './roundSchedule.test.js';
import './effects.test.js';

const results = await runAll();
const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length}/${results.length} passed`;

if (typeof document !== 'undefined') {
  const out = document.getElementById('results');
  out.textContent = results
    .map((r) => (r.ok ? `✓ ${r.name}` : `✗ ${r.name}\n    ${r.error}`))
    .concat('', summary)
    .join('\n');
  document.body.dataset.status = failed.length ? 'fail' : 'pass';
  document.title = `${failed.length ? '✗' : '✓'} ${summary}`;
} else {
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}\n    ${r.error}`);
  }
  console.log(`\n${summary}`);
  if (failed.length) process.exitCode = 1;
}
