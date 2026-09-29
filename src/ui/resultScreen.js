import { findCpu } from '../cpu/enemies.js';
import { h, button } from './dom.js';
import { OUTCOME_LABEL, reasonText } from './labels.js';

// 結果画面。params はセッションの end イベント（mode: 'cpu' | 'friend'）。

export const resultScreen = {
  render({ navigate, params }) {
    const isFriend = params.mode === 'friend';
    const cpu = isFriend ? null : findCpu(params.cpuId);
    const outcome = OUTCOME_LABEL[params.outcome] ? params.outcome : 'draw';
    const reason = reasonText(outcome, params.reason);
    const decided = params.rounds && outcome !== 'aborted' ? `・${params.rounds}問目で決着` : '';

    const vs = isFriend
      ? `vs ${params.opponentName ?? 'フレンド'}${decided}`
      : cpu && `vs CPU：${cpu.label}${decided}`;
    const note = isFriend ? 'フレンド戦のため、レートは変動しません。' : 'CPU戦のため、レートは変動しません。';

    const actions = isFriend
      ? [
        button('フレンド対戦へ', () => navigate('lobby')),
        button('戦績を見る', () => navigate('record'), { variant: 'ghost' }),
        button('タイトルへ', () => navigate('title'), { variant: 'ghost' }),
      ]
      : [
        cpu && button('もう一度', () => navigate('battle', { cpuId: cpu.id })),
        button('難易度を選び直す', () => navigate('select'), { variant: 'secondary' }),
        button('戦績を見る', () => navigate('record'), { variant: 'ghost' }),
        button('タイトルへ', () => navigate('title'), { variant: 'ghost' }),
      ];

    return h('section', { class: 'screen screen--result' },
      h('div', { class: `result result--${outcome}` },
        h('h1', { class: 'result__label' }, OUTCOME_LABEL[outcome]),
        reason && h('p', { class: 'result__reason' }, reason),
        vs && h('p', { class: 'result__vs' }, vs),
        h('p', { class: 'note' }, note),
      ),
      h('nav', { class: 'menu', 'aria-label': '次の操作' }, actions),
    );
  },
};
