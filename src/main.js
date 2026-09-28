import { titleScreen } from './ui/titleScreen.js';
import { selectScreen } from './ui/selectScreen.js';
import { battleScreen } from './ui/battleScreen.js';
import { resultScreen } from './ui/resultScreen.js';
import { recordScreen } from './ui/recordScreen.js';

// 各画面は { render({ navigate, params }) => HTMLElement, dispose?() } を持つ。
// navigate を引数で渡すことで、画面モジュールから main.js への循環 import を避ける。
const screens = {
  title: titleScreen,
  select: selectScreen,
  battle: battleScreen,
  result: resultScreen,
  record: recordScreen,
};

const app = document.getElementById('app');
let current = null;

function navigate(name, params = {}) {
  const screen = screens[name];
  if (!screen) throw new Error(`Unknown screen: ${name}`);

  current?.dispose?.();
  current = screen;

  const view = screen.render({ navigate, params });
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

navigate('title');
