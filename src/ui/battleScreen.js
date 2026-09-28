import { CONFIG } from '../config.js';
import { findCpu } from '../cpu/enemies.js';
import { planCpuAnswer } from '../cpu/cpuAI.js';
import { createBattle, resolveRound, forfeit } from '../core/battle.js';
import { judgeAnswer } from '../core/judge.js';
import { normalizeReading } from '../core/kana.js';
import { getGameData } from '../dictionary/setup.js';
import { rejectMessage } from '../dictionary/wordValidator.js';
import { getStore } from '../storage/storage.js';
import { h, button } from './dom.js';

// バトル画面（docs/SPEC.md §3）。
// 進行：イントロ →［出題準備 → 回答受付 → 判定タイム → 結果表示］× N → 結果画面
// ゲームのルール（攻撃順・ダメージ・決着）は core/battle.js、判定は core/judge.js に任せ、
// この画面はタイマー・入力・表示だけを受け持つ。

const OUTCOME_FOR_RESULT = { player: 'win', opponent: 'lose', draw: 'draw' };

function formatSec(ms) {
  return `${(ms / 1000).toFixed(2)}秒`;
}

export const battleScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    if (!cpu) {
      queueMicrotask(() => navigate('select'));
      return h('section', { class: 'screen' });
    }

    const timeLimitMs = CONFIG.battle.timeLimitSec * 1000;
    const names = { player: 'あなた', opponent: `CPU（${cpu.label}）` };
    const shortNames = { player: 'あなた', opponent: 'CPU' };
    const data = getGameData();

    let battle = createBattle({
      maxHp: CONFIG.battle.maxHp,
      drawAfterNoAttackRounds: CONFIG.battle.drawAfterNoAttackRounds,
    });
    let started = false;
    let disposed = false;
    let phase = 'intro'; // intro | preparing | answering | judging | revealed | finished
    let round = null;    // { prompt, startedAt, answers: { player, opponent } }
    let lastPrompt = null;
    let decidedRound = 0; // 何問目で決着したか
    const store = getStore();
    const timers = new Set();
    let rafId = 0;

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    const clearTimers = () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      cancelAnimationFrame(rafId);
    };

    // ---------- 要素 ----------

    const hpView = {};
    const fighter = (side) => {
      const fill = h('div', { class: 'hpbar__fill' });
      const text = h('span', { class: 'fighter__hp' });
      const bar = h('div', { class: 'hpbar', role: 'meter', 'aria-label': `${names[side]}のHP`, 'aria-valuemin': 0, 'aria-valuemax': battle.maxHp }, fill);
      hpView[side] = { fill, text, bar };
      return h('div', { class: `fighter fighter--${side}` },
        h('div', { class: 'fighter__head' },
          h('span', { class: 'fighter__name' }, side === 'player' ? names.player : cpu.label),
          text,
        ),
        bar,
      );
    };

    const roundLabel = h('span', { class: 'battle-bar__round' }, '');
    const promptBox = h('div', { class: 'prompt', 'aria-live': 'polite' });
    const timerFill = h('div', { class: 'timer__fill' });
    const timerSec = h('span', { class: 'timer__sec' }, CONFIG.battle.timeLimitSec.toFixed(1));
    const timer = h('div', { class: 'timer' }, h('div', { class: 'timer__bar' }, timerFill), timerSec);

    const statusView = {
      player: h('span', { class: 'answer-status__item' }),
      opponent: h('span', { class: 'answer-status__item' }),
    };
    const statusRow = h('div', { class: 'answer-status', 'aria-live': 'polite' }, statusView.player, statusView.opponent);

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
      readonly: true,
    });
    const submitButton = h('button', { type: 'submit', class: 'btn btn--primary answer-submit', disabled: true }, '回答する');
    const form = h('form', { class: 'answer-form', onSubmit: (e) => { e.preventDefault(); submitPlayerAnswer(); } }, input, submitButton);

    const judgePanel = h('section', { class: 'judge', hidden: true, 'aria-live': 'polite' });
    const messageBox = h('p', { class: 'battle-message', role: 'status' });

    const startButton = button('スタート', () => startBattle(), { disabled: true });
    const intro = h('div', { class: 'battle-intro' },
      h('p', { class: 'battle-intro__vs' }, `vs ${names.opponent}`),
      h('ul', { class: 'battle-intro__rules' },
        h('li', {}, `制限時間は1問${CONFIG.battle.timeLimitSec}秒`),
        h('li', {}, '「回答する」を押したら変更できません'),
        h('li', {}, 'CPUの答えは判定タイムまで見えません'),
      ),
      startButton,
    );

    const answerArea = h('div', { class: 'answer-area', hidden: true },
      promptBox, timer, statusRow, form,
    );

    const view = h('section', { class: 'screen screen--battle' },
      h('header', { class: 'battle-bar' },
        h('h1', { class: 'battle-bar__title' }, `CPU：${cpu.label}`, roundLabel),
        button('やめる', onQuit, { variant: 'ghost', small: true }),
      ),
      h('div', { class: 'fighters' }, fighter('player'), fighter('opponent')),
      intro,
      answerArea,
      messageBox,
      judgePanel,
    );

    // ---------- 表示更新 ----------

    function renderHp() {
      for (const side of ['player', 'opponent']) {
        const hp = battle.hp[side];
        const { fill, text, bar } = hpView[side];
        fill.style.width = `${(hp / battle.maxHp) * 100}%`;
        text.textContent = `${hp} / ${battle.maxHp}`;
        bar.setAttribute('aria-valuenow', hp);
        bar.classList.toggle('hpbar--low', hp <= battle.maxHp * 0.25);
      }
    }

    function renderStatus() {
      const answers = round?.answers ?? {};
      for (const side of ['player', 'opponent']) {
        const status = answers[side]?.status;
        let text;
        if (status === 'answered') text = '回答済み ✓';
        else if (status === 'timeout') text = '時間切れ';
        else text = side === 'player' ? '入力中…' : '考え中…';
        statusView[side].textContent = `${shortNames[side]} ${text}`;
        statusView[side].classList.toggle('is-done', status === 'answered');
      }
    }

    function renderPrompt(prompt) {
      promptBox.replaceChildren(
        h('span', { class: 'prompt__char' }, prompt.first),
        h('span', { class: 'prompt__text' }, 'から始まり'),
        h('span', { class: 'prompt__char' }, prompt.last),
        h('span', { class: 'prompt__text' }, 'で終わる言葉'),
      );
    }

    function renderTimer(elapsedMs) {
      const remain = Math.max(0, timeLimitMs - elapsedMs);
      timerFill.style.transform = `scaleX(${remain / timeLimitMs})`;
      timerSec.textContent = (remain / 1000).toFixed(1);
      timer.classList.toggle('timer--urgent', remain <= 5000);
    }

    function updateSubmitState() {
      const locked = Boolean(round?.answers.player);
      submitButton.disabled = phase !== 'answering' || locked || normalizeReading(input.value) === '';
    }

    function showMessage(text) {
      messageBox.textContent = text;
    }

    // ---------- 入力（IME 誤送信防止） ----------

    let composing = false;
    let lastCompositionEndAt = -Infinity;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
      composing = false;
      lastCompositionEndAt = performance.now();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // 変換確定の Enter で送信しない。Safari は compositionend の直後に keyCode 229 の Enter が届くことがある
      const justComposed = performance.now() - lastCompositionEndAt < 100;
      if (e.isComposing || composing || e.keyCode === 229 || justComposed) e.preventDefault();
    });
    input.addEventListener('input', updateSubmitState);

    function submitPlayerAnswer() {
      if (phase !== 'answering' || round.answers.player || composing) return;
      const value = input.value;
      if (normalizeReading(value) === '') return;

      const timeMs = Math.round(performance.now() - round.startedAt);
      if (timeMs >= timeLimitMs) return; // 締め切り処理に任せる

      round.answers.player = { status: 'answered', input: value, timeMs };
      input.readOnly = true;
      input.blur();
      submitButton.textContent = '回答済み ✓';
      updateSubmitState();
      renderStatus();
      checkAllAnswered();
    }

    // ---------- 進行 ----------

    async function prepareData() {
      try {
        const pool = await data.promptPool;
        await data.extra.preload();
        return pool;
      } catch {
        return null;
      }
    }

    async function initIntro() {
      showMessage('辞書を読み込んでいます…');
      const pool = await prepareData();
      if (disposed) return;
      if (!pool) {
        showMessage('辞書を読み込めませんでした。通信状況を確認して、もう一度お試しください。');
        return;
      }
      showMessage('');
      startButton.disabled = false;
    }

    function startBattle() {
      if (started) return;
      started = true;
      // ここからがバトル開始。以降の離脱（リロード・閉じる）は次回起動時に敗北として記録される
      store.beginMatch({ mode: 'cpu', cpuId: cpu.id });
      intro.hidden = true;
      answerArea.hidden = false;
      startRound();
    }

    async function startRound() {
      phase = 'preparing';
      judgePanel.hidden = true;
      // ユーザー操作の中でフォーカスしておくと、スマホでキーボードが開いたままになる
      input.value = '';
      input.readOnly = false;
      input.focus({ preventScroll: true });
      submitButton.textContent = '回答する';
      updateSubmitState();
      roundLabel.textContent = ` 第${battle.round + 1}問`;
      store.setActiveRound(battle.round + 1);
      promptBox.replaceChildren(h('span', { class: 'prompt__text' }, 'お題を準備中…'));
      renderTimer(0);

      const pool = await prepareData();
      if (disposed) return;
      const prompt = pool?.next({ avoid: lastPrompt });
      // 判定タイムで辞書の読み込み失敗が起きないよう、回答受付の前に必要なデータを読み込んでおく
      const ready = prompt && await data.official.preload(prompt.first).then(() => true, () => false);
      if (disposed) return;
      if (!ready) {
        promptBox.replaceChildren(
          h('span', { class: 'prompt__text' }, '辞書を読み込めませんでした'),
          button('再試行', () => startRound(), { variant: 'secondary', small: true }),
        );
        return;
      }

      lastPrompt = prompt;
      const cpuPlan = planCpuAnswer(cpu, pool.candidates(prompt), { timeLimitMs });
      round = { prompt, answers: { player: null, opponent: null }, startedAt: 0 };
      renderPrompt(prompt);
      renderStatus();

      phase = 'answering';
      round.startedAt = performance.now();
      updateSubmitState();

      if (cpuPlan.status === 'answered') {
        later(() => {
          if (phase !== 'answering') return;
          round.answers.opponent = cpuPlan;
          renderStatus();
          checkAllAnswered();
        }, cpuPlan.timeMs);
      }
      // タブが裏にあると requestAnimationFrame は止まるので、締め切りは setTimeout で管理する
      later(closeAnswering, timeLimitMs);
      tick();
    }

    function tick() {
      if (phase !== 'answering') return;
      renderTimer(performance.now() - round.startedAt);
      rafId = requestAnimationFrame(tick);
    }

    function checkAllAnswered() {
      if (round.answers.player && round.answers.opponent) closeAnswering();
    }

    /** 回答受付を締め切る。未回答の側は時間切れ。 */
    function closeAnswering() {
      if (phase !== 'answering') return;
      clearTimers();
      phase = 'judging';
      const elapsed = performance.now() - round.startedAt;
      for (const side of ['player', 'opponent']) {
        round.answers[side] ??= { status: 'timeout' };
      }
      renderTimer(round.answers.player.status === 'answered' && round.answers.opponent.status === 'answered' ? elapsed : timeLimitMs);
      input.readOnly = true;
      input.blur();
      updateSubmitState();
      renderStatus();
      runJudgement();
    }

    async function runJudgement() {
      showMessage('判定中…');
      const [player, opponent] = await Promise.all([
        judgeAnswer(data.validator, round.answers.player, round.prompt),
        judgeAnswer(data.validator, round.answers.opponent, round.prompt),
      ]);
      if (disposed) return;
      showMessage('');

      const outcome = resolveRound(battle, { player, opponent }, { timeLimitMs });
      battle = outcome.state;
      if (battle.result) {
        // 決着した瞬間に記録する（結果表示中に離脱しても敗北扱いにならないように）
        decidedRound = battle.round;
        recordResult();
      }
      renderHp();
      renderJudgement({ player, opponent }, outcome);
      phase = battle.result ? 'finished' : 'revealed';
    }

    function renderJudgement(judged, outcome) {
      const attackOf = (side) => outcome.attacks.find((a) => a.attacker === side);
      const firstAttacker = outcome.order === 'sequential' ? outcome.attacks[0].attacker : null;

      const card = (side) => {
        const j = judged[side];
        const attack = attackOf(side);
        let badge;
        let detail;
        if (j.status === 'timeout') {
          badge = h('span', { class: 'judge-badge judge-badge--timeout' }, '時間切れ');
          detail = h('p', { class: 'judge-card__effect' }, '攻撃なし');
        } else if (!j.valid) {
          badge = h('span', { class: 'judge-badge judge-badge--invalid' }, '✗ 無効');
          detail = h('p', { class: 'judge-card__effect judge-card__effect--invalid' }, rejectMessage(j.rejection));
        } else {
          badge = h('span', { class: 'judge-badge judge-badge--valid' }, '✓ 有効');
          let effect;
          if (attack) {
            const tag = outcome.order === 'simultaneous' ? '（同時）' : side === firstAttacker ? '（先攻）' : outcome.order === 'sequential' ? '（後攻）' : '';
            effect = `${attack.damage}ダメージ${tag}`;
          } else if (outcome.skipped === side) {
            effect = '先に決着したため攻撃なし';
          } else {
            effect = '攻撃なし';
          }
          detail = h('p', { class: 'judge-card__effect' }, effect);
        }

        return h('article', { class: `judge-card judge-card--${side}` },
          h('header', { class: 'judge-card__head' },
            h('span', { class: 'judge-card__name' }, names[side]),
            badge,
          ),
          j.status === 'answered' && h('p', { class: 'judge-card__word' }, j.surface || '（空）'),
          j.status === 'answered' && h('p', { class: 'judge-card__meta' },
            `${j.reading ? `${j.reading}・` : ''}${j.length}文字・${formatSec(j.timeMs)}`),
          detail,
        );
      };

      let summary;
      switch (outcome.order) {
        case 'simultaneous': summary = '同時攻撃！'; break;
        case 'sequential': summary = `${shortNames[firstAttacker]}の先攻`; break;
        case 'single': summary = `${shortNames[outcome.attacks[0].attacker]}の攻撃`; break;
        default: summary = `どちらも攻撃なし（${battle.noAttackStreak}/${battle.drawAfterNoAttackRounds}）`;
      }

      const next = battle.result
        ? button('結果を見る', goToResult)
        : button('次のお題へ', () => startRound());

      judgePanel.replaceChildren(
        h('h2', { class: 'judge__title' }, '判定タイム'),
        h('p', { class: 'judge__summary' }, summary),
        h('div', { class: 'judge__cards' }, card('player'), card('opponent')),
        next,
      );
      judgePanel.hidden = false;
      next.focus({ preventScroll: true });
      judgePanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function recordResult() {
      const { outcome, reason } = battle.result;
      store.finishMatch({ outcome: OUTCOME_FOR_RESULT[outcome], reason, rounds: decidedRound });
    }

    function goToResult() {
      const { outcome, reason } = battle.result;
      navigate('result', {
        cpuId: cpu.id,
        outcome: OUTCOME_FOR_RESULT[outcome],
        reason,
        rounds: decidedRound,
      });
    }

    function onQuit() {
      if (!started) {
        navigate('select');
        return;
      }
      if (battle.result) {
        goToResult();
        return;
      }
      // eslint-disable-next-line no-alert
      if (!window.confirm('バトルをやめると負けになります。やめますか？')) return;
      clearTimers();
      // 出題中・判定中なら、その問題で決着したことにする
      decidedRound = ['preparing', 'answering', 'judging'].includes(phase) ? battle.round + 1 : battle.round;
      phase = 'finished';
      battle = forfeit(battle, 'player');
      recordResult();
      goToResult();
    }

    renderHp();
    initIntro();

    return {
      el: view,
      dispose() {
        disposed = true;
        clearTimers();
      },
    };
  },
};
