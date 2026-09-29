import { CONFIG } from '../config.js';
import { findCpu } from '../cpu/enemies.js';
import { planCpuAnswer } from '../cpu/cpuAI.js';
import { createBattle, resolveRound, forfeit } from '../core/battle.js';
import { judgeAnswer } from '../core/judge.js';
import { normalizeReading } from '../core/kana.js';
import { scheduleRound, delayFight, nextRoundAt } from '../core/roundSchedule.js';
import { longWordCallout } from '../core/effects.js';
import { getGameData } from '../dictionary/setup.js';
import { rejectMessage } from '../dictionary/wordValidator.js';
import { getStore } from '../storage/storage.js';
import { h, button } from './dom.js';

// バトル画面（docs/SPEC.md §3）。
// 進行：説明 →［ROUND → READY → FIGHT!（お題表示・回答受付）→ 判定タイム（3秒）］× N → 結果画面
// 各段階の時刻は core/roundSchedule.js の時刻表で決める（将来の対人戦で両者のタイミングを揃えるため）。
// ゲームのルール（攻撃順・ダメージ・決着）は core/battle.js、判定は core/judge.js に任せ、
// この画面はタイマー・入力・表示だけを受け持つ。

const OUTCOME_FOR_RESULT = { player: 'win', opponent: 'lose', draw: 'draw' };

function formatSec(ms) {
  return `${(ms / 1000).toFixed(2)}秒`;
}

/** 実際の文字数。ダメージ計算用文字数が上限で頭打ちになった場合は両方を示す。 */
function lengthText(judged, attack) {
  if (attack && attack.damageLength < judged.length) {
    return `${judged.length}文字（ダメージ計算は${attack.damageLength}文字）`;
  }
  return `${judged.length}文字`;
}

export const battleScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    if (!cpu) {
      queueMicrotask(() => navigate('select'));
      return h('section', { class: 'screen' });
    }

    const timeLimitMs = CONFIG.battle.timeLimitSec * 1000;
    const timing = CONFIG.battle.timing;
    const names = { player: 'あなた', opponent: `CPU（${cpu.label}）` };
    const shortNames = { player: 'あなた', opponent: 'CPU' };
    const data = getGameData();

    let battle = createBattle({
      maxHp: CONFIG.battle.maxHp,
      drawAfterNoAttackRounds: CONFIG.battle.drawAfterNoAttackRounds,
    });
    let started = false;
    let disposed = false;
    let phase = 'lobby'; // lobby | intro（ROUND/READY）| answering | judging | revealed | finished
    let round = null;    // { prompt, startedAt, answers: { player, opponent } }
    let lastPrompt = null;
    let decidedRound = 0; // 何問目で決着したか
    const cpuUsedWords = new Set(); // このバトルで CPU が使った語（なるべく繰り返さない）
    const store = getStore();
    const timers = new Set();
    let rafId = 0;

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    // 指定時刻（performance.now() 基準）まで待つ。画面を離れたら（タイマーが消されたら）二度と解決しない
    const sleepUntil = (at) => new Promise((resolve) => later(resolve, Math.max(0, at - performance.now())));
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
    const banner = h('div', { class: 'round-banner', hidden: true, 'aria-live': 'assertive' });
    const stage = h('div', { class: 'stage' }, promptBox, banner);
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
      stage, timer, statusRow, form,
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

    /** ROUND / READY の間は、お題の代わりに伏せ字を出す（先読みさせない） */
    function renderHiddenPrompt() {
      promptBox.replaceChildren(
        h('span', { class: 'prompt__char prompt__char--hidden' }, '？'),
        h('span', { class: 'prompt__text' }, 'から始まり'),
        h('span', { class: 'prompt__char prompt__char--hidden' }, '？'),
        h('span', { class: 'prompt__text' }, 'で終わる言葉'),
      );
    }

    /** ROUND n / READY / FIGHT! の表示。kind で見た目を変える（fight はお題に重ならない位置に出てすぐ消える） */
    function showBanner(text, kind) {
      banner.textContent = text;
      banner.className = `round-banner round-banner--${kind}`;
      banner.hidden = false;
    }

    function hideBanner() {
      banner.hidden = true;
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

    /** お題を決め、判定に必要な辞書データを読み込む。失敗したら null。 */
    async function preparePrompt() {
      const pool = await prepareData();
      const prompt = pool?.next({ avoid: lastPrompt });
      if (!prompt) return null;
      // 判定タイムで辞書の読み込み失敗が起きないよう、回答受付の前に読み込んでおく
      const ok = await data.official.preload(prompt).then(() => true, () => false);
      return ok ? { pool, prompt } : null;
    }

    async function startRound() {
      phase = 'intro';
      clearTimers();
      judgePanel.hidden = true;
      round = null;
      input.value = '';
      input.readOnly = true;
      submitButton.textContent = '回答する';
      updateSubmitState();
      statusRow.hidden = true;
      renderHiddenPrompt();
      renderTimer(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const roundNo = battle.round + 1;
      roundLabel.textContent = ` 第${roundNo}問`;
      store.setActiveRound(roundNo);

      const schedule = scheduleRound(performance.now(), timing, timeLimitMs);
      const preparing = preparePrompt(); // ROUND / READY の間に裏で準備する（画面には出さない）

      showBanner(`ROUND ${roundNo}`, 'round');
      await sleepUntil(schedule.readyAt);
      if (disposed) return;

      showBanner('READY', 'ready');
      const prepared = await preparing;
      await sleepUntil(schedule.fightAt);
      if (disposed) return;

      if (!prepared) {
        hideBanner();
        promptBox.replaceChildren(
          h('span', { class: 'prompt__text' }, '辞書を読み込めませんでした'),
          button('再試行', () => startRound(), { variant: 'secondary', small: true }),
        );
        return;
      }
      // 読み込みが READY に間に合わなかった場合は、その分だけ FIGHT を遅らせる
      beginAnswering(prepared, delayFight(schedule, performance.now(), timeLimitMs, timing));
    }

    /** FIGHT!：お題表示・入力可・15秒タイマー開始・CPU回答タイマー開始を同時に行う */
    function beginAnswering({ pool, prompt }, schedule) {
      lastPrompt = prompt;
      const cpuPlan = planCpuAnswer(cpu, pool.candidates(prompt), { timeLimitMs, avoid: cpuUsedWords });
      if (cpuPlan.status === 'answered') cpuUsedWords.add(cpuPlan.input);

      round = { prompt, answers: { player: null, opponent: null }, startedAt: performance.now() };
      renderPrompt(prompt);
      statusRow.hidden = false;
      renderStatus();
      phase = 'answering';
      input.readOnly = false;
      // Android などではキーボードが開く。iOS は利用者の操作なしでは開かないので、入力欄をタップしてもらう
      input.focus({ preventScroll: true });
      updateSubmitState();

      showBanner('FIGHT!', 'fight');
      later(hideBanner, schedule.fightEndAt - schedule.fightAt);

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

      // 判定タイムは固定時間表示し、自動で次へ進む（スキップなし）
      const revealAt = performance.now();
      later(() => {
        if (battle.result) goToResult();
        else startRound();
      }, nextRoundAt(revealAt, timing) - revealAt);
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
        const callout = j.status === 'answered' && j.valid ? longWordCallout(j.length) : null;

        return h('article', { class: `judge-card judge-card--${side}` },
          h('header', { class: 'judge-card__head' },
            h('span', { class: 'judge-card__name' }, names[side]),
            badge,
          ),
          callout && h('p', { class: `callout callout--${callout.level}` }, callout.text),
          j.status === 'answered' && h('p', { class: 'judge-card__word' }, j.surface || '（空）'),
          j.status === 'answered' && h('p', { class: 'judge-card__meta' },
            `${j.reading ? `${j.reading}・` : ''}${lengthText(j, attack)}・${formatSec(j.timeMs)}`),
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

      // 次のラウンド（決着なら結果画面）までの残り時間。操作はできない
      const progress = h('div', { class: 'judge__next' },
        h('span', { class: 'judge__next-label' }, battle.result ? 'まもなく結果へ' : '次のラウンドへ'),
        h('div', { class: 'judge__next-bar' },
          h('div', { class: 'judge__next-fill', style: { animationDuration: `${timing.revealMs}ms` } })),
      );

      judgePanel.replaceChildren(
        h('h2', { class: 'judge__title' }, '判定タイム'),
        h('p', { class: 'judge__summary' }, summary),
        h('div', { class: 'judge__cards' }, card('player'), card('opponent')),
        progress,
      );
      judgePanel.hidden = false;
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
      if (!window.confirm('バトルをやめると負けになります。やめますか？')) return;
      clearTimers();
      // 出題中・判定中なら、その問題で決着したことにする
      decidedRound = ['intro', 'answering', 'judging'].includes(phase) ? battle.round + 1 : battle.round;
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
