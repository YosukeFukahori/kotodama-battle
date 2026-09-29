import { CONFIG } from '../config.js';
import { getGameData } from '../dictionary/setup.js';
import { getRoomStore, isLocalOnlyRoomStore } from '../net/roomStore.js';
import { createRoom, joinRoom, setReady, leaveRoom, startMatch, touch, isExpired, roomPath, otherSide, RoomError, isValidRoomCode } from '../match/friendRoom.js';
import { FriendSession } from '../match/friendSession.js';
import { getClientId, defaultPlayerName, profileKey } from '../match/identity.js';
import { h, button } from './dom.js';

// フレンド対戦のロビー（docs/SPEC.md §10.2）：名前 → 部屋を作る／コードで参加 → 準備OK → 対戦開始。

const NAME_KEY = 'kotodama.friend.name';

function loadName() {
  try { return localStorage.getItem(profileKey(NAME_KEY)) ?? ''; } catch { return ''; }
}

function saveName(name) {
  try { localStorage.setItem(profileKey(NAME_KEY), name); } catch { /* 保存できなくても続行 */ }
}

function formatClock(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const friendLobbyScreen = {
  render({ navigate }) {
    const store = getRoomStore();
    const clientId = getClientId();
    let joined = null; // { code, side }
    let unsubscribe = null;
    let heartbeatId = 0;
    let navigated = false;
    let starting = false;
    const placeholderName = defaultPlayerName();

    const body = h('div', { class: 'lobby' });
    const view = h('section', { class: 'screen screen--lobby' },
      h('header', { class: 'screen-header' },
        h('h1', {}, 'フレンド対戦'),
        h('p', { class: 'note' }, '部屋コードで2人対戦。レートは変動しません。'),
        isLocalOnlyRoomStore() && h('p', { class: 'notice' }, '試作版：いまは通信なしで、同じブラウザの別タブどうしでのみ対戦できます（オンライン接続は準備中）。'),
      ),
      body,
    );

    // ---------- 入口：名前・部屋を作る・コードで参加 ----------

    function renderEntry(errorText = '') {
      const nameInput = h('input', {
        class: 'lobby-input', type: 'text', maxlength: 12, value: loadName(), placeholder: placeholderName,
        'aria-label': 'プレイヤー名', autocomplete: 'off',
      });
      const codeInput = h('input', {
        class: 'lobby-input lobby-input--code', type: 'text', inputmode: 'numeric', maxlength: CONFIG.friend.codeDigits,
        placeholder: '6桁の部屋コード', 'aria-label': '部屋コード', autocomplete: 'off', pattern: '[0-9]*',
      });
      const playerName = () => {
        const name = nameInput.value.trim() || placeholderName;
        saveName(nameInput.value.trim());
        return name;
      };
      const error = h('p', { class: 'lobby-error', role: 'alert' }, errorText);
      const createButton = button('部屋を作る', async () => {
        createButton.disabled = true;
        try {
          const code = await createRoom(store, { clientId, name: playerName() });
          enterRoom(code, 'host');
        } catch (e) {
          renderEntry(e instanceof RoomError ? e.message : '部屋を作れませんでした');
        }
      });
      const joinButton = button('参加する', async () => {
        const code = codeInput.value.trim();
        if (!isValidRoomCode(code)) {
          error.textContent = '部屋コードは6桁の数字です';
          return;
        }
        joinButton.disabled = true;
        try {
          const side = await joinRoom(store, code, { clientId, name: playerName() });
          enterRoom(code, side);
        } catch (e) {
          renderEntry(e instanceof RoomError ? e.message : '参加できませんでした');
        }
      }, { variant: 'secondary' });

      body.replaceChildren(
        h('label', { class: 'lobby-field' }, h('span', { class: 'lobby-label' }, 'プレイヤー名（空欄なら自動）'), nameInput),
        h('section', { class: 'panel' },
          h('h2', { class: 'panel__title' }, '部屋を作る'),
          h('p', { class: 'note' }, '部屋コードを相手に伝えてください。有効期限は30分です。'),
          createButton,
        ),
        h('section', { class: 'panel' },
          h('h2', { class: 'panel__title' }, '部屋に参加する'),
          codeInput,
          joinButton,
        ),
        error,
        h('div', { class: 'screen-footer' }, button('もどる', () => navigate('title'), { variant: 'ghost' })),
      );
    }

    // ---------- 部屋の中：参加者・準備OK ----------

    function enterRoom(code, side) {
      joined = { code, side };
      unsubscribe = store.subscribe(roomPath(code), (room) => renderRoom(room));
      const beat = () => {
        touch(store, code, side);
        heartbeatId = setTimeout(beat, CONFIG.friend.heartbeatMs);
      };
      beat();
    }

    function leave(message = '') {
      if (joined) leaveRoom(store, joined.code, joined.side);
      unsubscribe?.();
      clearTimeout(heartbeatId);
      joined = null;
      renderEntry(message);
    }

    async function renderRoom(room) {
      if (!joined || navigated) return;
      const { code, side } = joined;
      if (!room?.meta || room.meta.status === 'closed') {
        unsubscribe?.();
        clearTimeout(heartbeatId);
        joined = null;
        renderEntry(side === 'guest' ? 'ホストが部屋を閉じました' : '');
        return;
      }
      if (isExpired(room, store.serverNow()) && room.meta.status === 'waiting') {
        leave('部屋の有効期限が切れました');
        return;
      }
      if (room.match?.status === 'playing') {
        navigated = true;
        unsubscribe?.();
        clearTimeout(heartbeatId);
        navigate('battle', { session: new FriendSession({ store, code, side, room }) });
        return;
      }

      const me = room.players?.[side];
      const opponent = room.players?.[otherSide(side)];
      const bothReady = me?.ready && opponent?.ready;
      if (side === 'host' && bothReady && !starting) {
        starting = true;
        startMatch(store, code, { pool: await getGameData().promptPool }).finally(() => { starting = false; });
      }

      const playerRow = (who, p, label) => h('li', { class: 'lobby-player' },
        h('span', { class: 'lobby-player__name' }, p ? p.name : '（待機中…）', label && h('span', { class: 'lobby-player__you' }, label)),
        h('span', { class: `lobby-player__ready${p?.ready ? ' is-ready' : ''}` }, p ? (p.ready ? '準備OK ✓' : '準備中') : ''),
      );

      const readyButton = button(me?.ready ? '準備OKを取り消す' : '準備OK', () => setReady(store, code, side, !me?.ready), {
        variant: me?.ready ? 'secondary' : 'primary',
        disabled: !opponent,
      });

      body.replaceChildren(
        h('section', { class: 'panel lobby-room' },
          h('p', { class: 'lobby-code__label' }, '部屋コード'),
          h('p', { class: 'lobby-code', 'aria-label': `部屋コード ${code}` }, code),
          h('p', { class: 'note' }, `有効期限 ${formatClock(room.meta.expiresAt)} まで`),
        ),
        h('section', { class: 'panel' },
          h('h2', { class: 'panel__title' }, '参加者'),
          h('ul', { class: 'lobby-players' },
            playerRow('host', room.players?.host, side === 'host' ? '（あなた）' : ''),
            playerRow('guest', room.players?.guest, side === 'guest' ? '（あなた）' : ''),
          ),
          h('p', { class: 'note' }, opponent ? '2人とも「準備OK」を押すと対戦が始まります。' : '相手の参加を待っています…'),
        ),
        h('div', { class: 'menu' }, readyButton),
        h('div', { class: 'screen-footer' }, button('部屋を出る', () => leave(), { variant: 'ghost' })),
      );
    }

    renderEntry();

    return {
      el: view,
      dispose() {
        unsubscribe?.();
        clearTimeout(heartbeatId);
        // 対戦に進まずにロビーを離れたら退出する
        if (joined && !navigated) leaveRoom(store, joined.code, joined.side);
      },
    };
  },
};
