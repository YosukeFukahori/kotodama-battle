import { titleScreen } from './ui/titleScreen.js';
import { selectScreen } from './ui/selectScreen.js';
import { battleScreen } from './ui/battleScreen.js';
import { resultScreen } from './ui/resultScreen.js';
import { recordScreen } from './ui/recordScreen.js';
import { getStore } from './storage/storage.js';
import { findCpu } from './cpu/enemies.js';

// 各画面は render({ navigate, params }) を持ち、次のどちらかを返す：
//   - HTMLElement
//   - { el: HTMLElement, dispose() }   … タイマー等の後始末が必要な画面
// navigate を引数で渡すことで、画面モジュールから main.js への循環 import を避ける。
const screens = {
  title: titleScreen,
  select: selectScreen,
  battle: battleScreen,
  result: resultScreen,
  record: recordScreen,
};

const app = document.getElementById('app');
let disposeCurrent = null;

function navigate(name, params = {}) {
  const screen = screens[name];
  if (!screen) throw new Error(`Unknown screen: ${name}`);

  disposeCurrent?.();
  disposeCurrent = null;

  const rendered = screen.render({ navigate, params });
  const view = rendered instanceof Node ? rendered : rendered.el;
  if (!(rendered instanceof Node)) disposeCurrent = rendered.dispose ?? null;

  view.dataset.screen = name;
  app.replaceChildren(view);
  window.scrollTo(0, 0);

  // 画面切り替え時は見出しへフォーカスを移し、スクリーンリーダーにも伝わるようにする
  const heading = view.querySelector('h1, h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

// 前回のバトル中に離脱（リロード・タブを閉じる等）していれば、敗北として1回だけ記録する
const abandoned = getStore().recoverAbandonedMatch();
const notice = abandoned
  ? `前回のバトル（CPU：${findCpu(abandoned.cpuId)?.label ?? '?'}）を途中で離脱したため、敗北として記録しました。`
  : null;

navigate('title', { notice });
