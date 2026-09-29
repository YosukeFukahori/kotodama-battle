import { findCpu } from '../cpu/enemies.js';
import { getStore, winRate } from '../storage/storage.js';
import { h, button } from './dom.js';
import { OUTCOME_LABEL, reasonShort } from './labels.js';

// 戦績画面（docs/SPEC.md §6）。Ver.0.1 は CPU戦のみ表示する（ranked は表示しない）。

function statRow(label, value) {
  return h('div', { class: 'stat' },
    h('dt', { class: 'stat__label' }, label),
    h('dd', { class: 'stat__value' }, value),
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function opponentLabel(entry, cpu) {
  if (entry.mode === 'friend') return `vs ${entry.opponentName || 'フレンド'}`;
  return cpu ? cpu.label : entry.cpuId ?? 'CPU';
}

function historyItem(entry) {
  const cpu = findCpu(entry.cpuId);
  const detail = [entry.rounds > 0 ? `${entry.rounds}問目` : '開始直後', reasonShort(entry.reason)].filter(Boolean).join('・');
  return h('li', { class: 'history__item' },
    h('span', { class: `history__outcome history__outcome--${entry.outcome}` }, OUTCOME_LABEL[entry.outcome]),
    h('span', { class: 'history__main' },
      h('span', { class: 'history__cpu' }, opponentLabel(entry, cpu)),
      h('span', { class: 'history__detail' }, detail),
    ),
    h('time', { class: 'history__date', datetime: entry.at }, formatDate(entry.at)),
  );
}

const PANELS = [
  { mode: 'cpu', title: 'CPU戦', note: 'CPU戦は練習モードです。レートには影響しません。' },
  { mode: 'friend', title: 'フレンド戦', note: 'フレンド戦もレートには影響しません。' },
  // ranked は Ver.0.2 では表示しない
];

function modePanels(save, { mode, title, note }) {
  const record = save.record[mode];
  const history = save.history[mode];
  const rate = winRate(record);
  const total = record.wins + record.losses + record.draws;
  return [
    h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, `${title}${total ? `（${total}試合）` : ''}`),
      h('dl', { class: 'stats stats--4' },
        statRow('勝ち', record.wins),
        statRow('負け', record.losses),
        statRow('引き分け', record.draws),
        statRow('勝率', rate == null ? '—' : `${Math.round(rate * 100)}%`),
      ),
      h('p', { class: 'note' }, `${note}勝率は引き分けを含む全試合で計算しています。`),
    ),
    h('section', { class: 'panel' },
      h('h2', { class: 'panel__title' }, `${title}：直近${history.length ? `${history.length}` : ''}試合`),
      history.length
        ? h('ol', { class: 'history' }, history.map(historyItem))
        : h('p', { class: 'note' }, 'まだ試合がありません。'),
    ),
  ];
}

export const recordScreen = {
  render({ navigate }) {
    const save = getStore().load();
    return h('section', { class: 'screen screen--record' },
      h('header', { class: 'screen-header' },
        h('h1', {}, '戦績'),
      ),
      PANELS.flatMap((panel) => modePanels(save, panel)),
      h('div', { class: 'screen-footer' },
        button('もどる', () => navigate('title'), { variant: 'ghost' }),
      ),
    );
  },
};
