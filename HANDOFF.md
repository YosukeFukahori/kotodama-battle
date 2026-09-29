# HANDOFF（Ver.0.2 フレンド対戦の開発）

新しいセッションでは CLAUDE.md → docs/SPEC.md（特に §10）→ このファイルの順に読み、必要なファイルだけ確認する。

## 完了
- 手順1：MatchSession / CpuSession 導入。バトル画面はセッションのイベントを表示するだけ（CPU戦の挙動は不変）
- 手順2：審判 `src/match/referee.js`（refereeRound・sanitizeAnswer）。CpuSession はこれを使う
- 手順3：戦績に friend を追加（record/history.friend、戦績画面にも表示）。過去データは既定値で補完
- 手順4：通信なしのフレンド戦。RoomStore（`src/net/roomStore.js`、LocalRoomStore＝localStorage/Map）、部屋（`src/match/friendRoom.js`）、FriendSession（`src/match/friendSession.js`）。2セッションで1試合・切断中止をテスト済み

## 重要な設計判断
- セッションの取り決めとイベント一覧は `src/match/session.js` の冒頭コメントが正本
- バトル画面（`src/ui/battleScreen.js`）はモード非依存。`params.session` があればそれを使い、なければ `params.cpuId` から CpuSession を作る
- イベントの judged / outcome / hp は常に「自分 = player、相手 = opponent」視点
- 戦績の記録（beginMatch / finishMatch）はセッションの責任。画面は storage を触らない
- storage：friend の途中離脱は負けにしない（ABANDON_IS_LOSS）。中止は cancelMatch()（記録なし）。履歴に opponentName を持てる
- 部屋データは rooms/{code}（meta / players / match / rounds/{n}）。両者は host / guest で保存し、各端末で player / opponent に読み替える
- 時刻はすべてホストが決めたサーバー時刻（schedule・revealAt・nextRoundAt）。各端末は serverNow との差で自分の時計に換算して表示する
- ホストの裁定は「判定結果＋状態＋次ラウンド（時刻表・お題）」を store.update で一括書き込み（途中状態を見せない）
- 切断：各端末が players/{side}/lastSeen を定期更新。途絶→接続待ち表示→復帰待ち超過で match.status=aborted（記録なし）
- ?profile=xxx で端末を分けられる（clientId・戦績キー・参加中の部屋が profile ごと）。2画面テスト用
- 審判は referee.js に一本化（CPU・フレンドのホスト・将来のサーバーで共通）。相手端末の申告は sanitizeAnswer を通す

## 主要ファイル
- `src/match/session.js`（BaseSession：イベント・タイマー）
- `src/match/cpuSession.js`（CPU戦の進行）
- `src/match/referee.js`（審判）
- `src/ui/battleScreen.js`（表示のみ）
- `src/net/roomStore.js`・`src/match/friendRoom.js`・`src/match/friendSession.js`・`src/match/identity.js`
- `tests/e2e/`（index.js が入口。input：FIGHT!前の入力制御、cpu：CPU戦1試合）

## 次にやること
- 手順5：ロビー UI ＋ 2画面 E2E
- Firebase 接続はまだしない

## 注意点
- CPU戦を壊していないかは `/tests/`（ロジック）と `/tests/e2e/`（操作。CPU戦1試合で約40秒）で確認する
- この Mac の Node は v8 なので、テストはブラウザで実行する
