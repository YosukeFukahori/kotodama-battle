// テストランナー。
// ブラウザ：http://localhost:8000/tests/ を開く
// Node（14以上）：node tests/run.js

import { runAll } from './harness.js';

// テストファイルを追加したらここに追記する
import './kana.test.js';

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
