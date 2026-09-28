import { CONFIG } from '../config.js';
import { findCpu } from '../cpu/enemies.js';
import { h, button } from './dom.js';

// 実装順序1：レイアウトの骨組みのみ。バトル進行は実装順序4で組み込む。

function hpBar(name, hp, maxHp, side) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  return h('div', { class: `fighter fighter--${side}` },
    h('div', { class: 'fighter__head' },
      h('span', { class: 'fighter__name' }, name),
      h('span', { class: 'fighter__hp' }, `${hp} / ${maxHp}`),
    ),
    h('div', {
      class: 'hpbar',
      role: 'meter',
      'aria-label': `${name}のHP`,
      'aria-valuemin': 0,
      'aria-valuemax': maxHp,
      'aria-valuenow': hp,
    },
      h('div', { class: 'hpbar__fill', style: { width: `${ratio * 100}%` } }),
    ),
  );
}

export const battleScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    if (!cpu) {
      queueMicrotask(() => navigate('select'));
      return h('section', { class: 'screen' });
    }

    const { maxHp, timeLimitSec } = CONFIG.battle;

    const input = h('input', {
      class: 'answer-input',
      type: 'text',
      name: 'answer',
      lang: 'ja',
      inputmode: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
      placeholder: 'かなで入力',
      'aria-label': '回答',
    });

    const form = h('form', {
      class: 'answer-form',
      onSubmit: (e) => e.preventDefault(),
    },
      input,
      h('button', { type: 'submit', class: 'btn btn--primary answer-submit' }, '送信'),
    );

    return h('section', { class: 'screen screen--battle' },
      h('header', { class: 'battle-bar' },
        h('h1', { class: 'battle-bar__title' }, `CPU：${cpu.label}`),
        button('やめる', () => navigate('title'), { variant: 'ghost', small: true }),
      ),
      h('div', { class: 'fighters' },
        hpBar('あなた', maxHp, maxHp, 'player'),
        hpBar(cpu.label, maxHp, maxHp, 'cpu'),
      ),
      h('div', { class: 'prompt', 'aria-live': 'polite' },
        h('span', { class: 'prompt__char' }, 'あ'),
        h('span', { class: 'prompt__text' }, 'から始まり'),
        h('span', { class: 'prompt__char' }, 'で'),
        h('span', { class: 'prompt__text' }, 'で終わる言葉'),
      ),
      h('div', { class: 'timer' },
        h('div', { class: 'timer__bar' }, h('div', { class: 'timer__fill' })),
        h('span', { class: 'timer__sec' }, `${timeLimitSec}.0`),
      ),
      form,
      h('div', { class: 'battle-log', role: 'log' },
        h('p', { class: 'note' }, 'バトル進行は実装順序4で組み込みます。'),
      ),
      h('div', { class: 'dev-tools' },
        h('p', { class: 'note' }, '画面遷移確認用（仮）'),
        h('div', { class: 'dev-tools__row' },
          button('勝利', () => navigate('result', { cpuId: cpu.id, outcome: 'win' }), { variant: 'ghost', small: true }),
          button('敗北', () => navigate('result', { cpuId: cpu.id, outcome: 'lose' }), { variant: 'ghost', small: true }),
          button('引き分け', () => navigate('result', { cpuId: cpu.id, outcome: 'draw' }), { variant: 'ghost', small: true }),
        ),
      ),
    );
  },
};
