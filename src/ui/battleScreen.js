import { CONFIG } from '../config.js';
import { findCpu } from '../cpu/enemies.js';
import { normalizeReading } from '../core/kana.js';
import { longWordCallout } from '../core/effects.js';
import { rejectMessage } from '../dictionary/wordValidator.js';
import { CpuSession } from '../match/cpuSession.js';
import { h, button } from './dom.js';

// バトル画面（docs/SPEC.md §3）。対戦モードに依存しない表示部分。
// 進行はセッション（src/match/*Session.js）が持ち、この画面は
//   ・セッションから届くイベントを表示する
//   ・回答をセッションに渡す
// だけを受け持つ。セッションのイベントの一覧は src/match/session.js を参照。

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

/** params から対戦セッションを用意する（params.session があればそれを使う） */
function sessionFrom(params) {
  if (params.session) return params.session;
  const cpu = findCpu(params.cpuId);
  return cpu ? new CpuSession({ cpu }) : null;
}

export const battleScreen = {
  render({ navigate, params }) {
    const session = sessionFrom(params);
    if (!session) {
      queueMicrotask(() => navigate('select'));
      return h('section', { class: 'screen' });
    }

    const { labels, maxHp } = session;
    const timing = session.timing ?? CONFIG.battle.timing;
    const names = { player: labels.player, opponent: labels.opponent };
    const shortNames = { player: labels.player, opponent: labels.opponentShort };

    let started = !session.requiresStartButton;
    let answering = false;
    let playerLocked = false;
    let fightInfo = null; // { startedAt, timeLimitMs }
    let rafId = 0;
    const uiTimers = new Set();
    const statuses = { player: null, opponent: null };

    const uiLater = (fn, ms) => {
      const id = setTimeout(() => { uiTimers.delete(id); fn(); }, ms);
      uiTimers.add(id);
    };
    const clearUiTimers = () => {
      for (const id of uiTimers) clearTimeout(id);
      uiTimers.clear();
      cancelAnimationFrame(rafId);
    };

    // ---------- 要素 ----------

    const hpView = {};
    const fighter = (side) => {
      const fill = h('div', { class: 'hpbar__fill' });
      const text = h('span', { class: 'fighter__hp' });
      const bar = h('div', { class: 'hpbar', role: 'meter', 'aria-label': `${names[side]}のHP`, 'aria-valuemin': 0, 'aria-valuemax': maxHp }, fill);
      hpView[side] = { fill, text, bar };
      return h('div', { class: `fighter fighter--${side}` },
        h('div', { class: 'fighter__head' },
          h('span', { class: 'fighter__name' }, side === 'player' ? labels.player : labels.opponentHp),
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
    const timerSec = h('span', { class: 'timer__sec' }, (session.timeLimitMs / 1000).toFixed(1));
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
      disabled: true,
    });
    const submitButton = h('button', { type: 'submit', class: 'btn btn--primary answer-submit', disabled: true }, '回答する');
    const form = h('form', { class: 'answer-form is-locked', onSubmit: (e) => { e.preventDefault(); submitPlayerAnswer(); } }, input, submitButton);

    const judgePanel = h('section', { class: 'judge', hidden: true, 'aria-live': 'polite' });
    const messageBox = h('p', { class: 'battle-message', role: 'status' });

    const startButton = button('スタート', () => startBattle(), { disabled: true });
    const intro = h('div', { class: 'battle-intro', hidden: !session.requiresStartButton },
      h('p', { class: 'battle-intro__vs' }, `vs ${names.opponent}`),
      h('ul', { class: 'battle-intro__rules' },
        h('li', {}, `制限時間は1問${session.timeLimitMs / 1000}秒`),
        h('li', {}, '「回答する」を押したら変更できません'),
        h('li', {}, `${shortNames.opponent}の答えは判定タイムまで見えません`),
      ),
      startButton,
    );

    const answerArea = h('div', { class: 'answer-area', hidden: session.requiresStartButton },
      stage, timer, statusRow, form,
    );

    const view = h('section', { class: 'screen screen--battle' },
      h('header', { class: 'battle-bar' },
        h('h1', { class: 'battle-bar__title' }, labels.title, roundLabel),
        button('やめる', onQuit, { variant: 'ghost', small: true }),
      ),
      h('div', { class: 'fighters' }, fighter('player'), fighter('opponent')),
      intro,
      answerArea,
      messageBox,
      judgePanel,
    );

    // ---------- 表示更新 ----------

    function renderHp(hp = { player: maxHp, opponent: maxHp }) {
      for (const side of ['player', 'opponent']) {
        const value = hp[side];
        const { fill, text, bar } = hpView[side];
        fill.style.width = `${(value / maxHp) * 100}%`;
        text.textContent = `${value} / ${maxHp}`;
        bar.setAttribute('aria-valuenow', value);
        bar.classList.toggle('hpbar--low', value <= maxHp * 0.25);
      }
    }

    function renderStatus() {
      for (const side of ['player', 'opponent']) {
        const status = statuses[side];
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
      const limit = session.timeLimitMs;
      const remain = Math.max(0, limit - elapsedMs);
      timerFill.style.transform = `scaleX(${remain / limit})`;
      timerSec.textContent = (remain / 1000).toFixed(1);
      timer.classList.toggle('timer--urgent', remain <= 5000);
    }

    function tick() {
      if (!answering || !fightInfo) return;
      renderTimer(performance.now() - fightInfo.startedAt);
      rafId = requestAnimationFrame(tick);
    }

    function updateSubmitState() {
      submitButton.disabled = !answering || playerLocked || normalizeReading(input.value) === '';
    }

    function showMessage(text) {
      messageBox.textContent = text;
    }

    // ---------- 入力（IME 誤送信防止・FIGHT! 前は操作不能） ----------

    let composing = false;
    let lastCompositionEndAt = -Infinity;

    /** IME の状態を初期化する（前のラウンドや FIGHT! 前の操作の影響を残さない） */
    function resetComposition() {
      composing = false;
      lastCompositionEndAt = -Infinity;
    }

    /**
     * 入力欄と回答ボタンの操作可否。
     * 無効の間は disabled（フォーカスもできない）＋ pointer-events: none（.is-locked）で完全に操作不能にする。
     * readOnly だとフォーカスはできてしまい、FIGHT! 前にタップされた状態が残って
     * 「FIGHT! 後に文字が入らない」原因になるため使わない。
     */
    function lockAnswerInput() {
      input.blur();
      input.disabled = true;
      form.classList.add('is-locked');
      resetComposition();
      updateSubmitState();
    }

    function unlockAnswerInput() {
      // フォーカス・IME の状態を一度リセットしてから入力可能にする
      input.blur();
      resetComposition();
      input.disabled = false;
      form.classList.remove('is-locked');
      updateSubmitState();
      // 自動フォーカスはマウス操作の端末だけ（iPhone 等はプログラムからの focus でキーボードが出ず、
      // かえってフォーカス状態がずれることがあるため、利用者のタップに任せる）
      if (window.matchMedia?.('(pointer: fine)').matches) input.focus({ preventScroll: true });
    }

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
      if (!answering || playerLocked || composing) return;
      session.submitAnswer(input.value);
    }

    // ---------- セッションのイベント ----------

    const handlers = {
      round({ roundNo }) {
        clearUiTimers();
        answering = false;
        playerLocked = false;
        fightInfo = null;
        statuses.player = null;
        statuses.opponent = null;
        judgePanel.hidden = true;
        showMessage('');
        lockAnswerInput(); // ROUND / READY の間は完全に操作不能
        input.value = '';
        submitButton.textContent = '回答する';
        updateSubmitState();
        statusRow.hidden = true;
        renderHiddenPrompt();
        renderTimer(0);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        roundLabel.textContent = ` 第${roundNo}問`;
        showBanner(`ROUND ${roundNo}`, 'round');
      },
      ready() {
        showBanner('READY', 'ready');
      },
      fight({ prompt, startedAt, timeLimitMs, fightMs }) {
        fightInfo = { startedAt, timeLimitMs };
        renderPrompt(prompt);
        statusRow.hidden = false;
        renderStatus();
        answering = true;
        unlockAnswerInput(); // この瞬間から入力可能
        showBanner('FIGHT!', 'fight');
        uiLater(hideBanner, fightMs ?? timing.fightMs);
        tick();
      },
      answerStatus({ side, status }) {
        statuses[side] = status;
        renderStatus();
        if (side === 'player') {
          playerLocked = true;
          lockAnswerInput();
          if (status === 'answered') submitButton.textContent = '回答済み ✓';
        }
      },
      judging() {
        answering = false;
        cancelAnimationFrame(rafId);
        lockAnswerInput();
        const bothAnswered = statuses.player === 'answered' && statuses.opponent === 'answered';
        renderTimer(bothAnswered && fightInfo ? performance.now() - fightInfo.startedAt : session.timeLimitMs);
        showMessage('判定中…');
      },
      result(event) {
        showMessage('');
        renderHp(event.hp);
        renderJudgement(event);
      },
      end(event) {
        clearUiTimers();
        navigate('result', event);
      },
      error({ message, retry }) {
        hideBanner();
        promptBox.replaceChildren(
          h('span', { class: 'prompt__text' }, message),
          button('再試行', () => retry(), { variant: 'secondary', small: true }),
        );
      },
      connection({ opponentConnected, waitUntil }) {
        if (opponentConnected) {
          showMessage('');
          return;
        }
        const sec = Math.max(0, Math.ceil((waitUntil - performance.now()) / 1000));
        showMessage(`相手の接続が切れました。復帰を待っています（残り約${sec}秒）`);
      },
    };

    const off = session.on((event) => handlers[event.type]?.(event));

    function renderJudgement({ judged, outcome, noAttackStreak, drawAfter, finished, nextAt }) {
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
        default: summary = `どちらも攻撃なし（${noAttackStreak}/${drawAfter}）`;
      }

      // 次のラウンド（決着なら結果画面）までの残り時間。操作はできない
      const remainMs = Math.max(0, nextAt - performance.now());
      const progress = h('div', { class: 'judge__next' },
        h('span', { class: 'judge__next-label' }, finished ? 'まもなく結果へ' : '次のラウンドへ'),
        h('div', { class: 'judge__next-bar' },
          h('div', { class: 'judge__next-fill', style: { animationDuration: `${remainMs}ms` } })),
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

    // ---------- 開始・終了 ----------

    async function initIntro() {
      showMessage('辞書を読み込んでいます…');
      const ok = await session.prepare();
      if (!ok) {
        showMessage('辞書を読み込めませんでした。通信状況を確認して、もう一度お試しください。');
        return;
      }
      showMessage('');
      startButton.disabled = false;
    }

    function startBattle() {
      if (started) return;
      started = true;
      intro.hidden = true;
      answerArea.hidden = false;
      session.start();
    }

    function onQuit() {
      if (!started) {
        navigate(session.mode === 'cpu' ? 'select' : 'title');
        return;
      }
      // 決着済みなら確認なしで結果へ（負けにはならない）
      if (!session.finished && !window.confirm('バトルをやめると負けになります。やめますか？')) return;
      session.forfeit();
    }

    renderHp();
    if (session.requiresStartButton) initIntro();
    else session.start();

    return {
      el: view,
      dispose() {
        off();
        clearUiTimers();
        session.dispose();
      },
    };
  },
};
