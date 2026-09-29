// Firebase の初期化と匿名ログイン（docs/SPEC.md §10.1）。フレンド対戦を開いたときだけ読み込まれる。
// ビルドなしで GitHub Pages から動かすため、公式 JS SDK を gstatic の配信元から ES Modules で読み込む。

import { getProfile } from '../match/identity.js';

export const FIREBASE_SDK_VERSION = '12.19.0';
const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

/**
 * Firebase を初期化し、匿名ログインする。
 * ログイン状態は端末（IndexedDB）に保存されるので、再読み込みしても同じ匿名ユーザー（uid）に戻る。
 * ?profile=xxx のときは別名の Firebase アプリとして初期化する（同じブラウザで2画面テストするとき、別ユーザーにするため）。
 * @returns {Promise<{ app, db, user, database }>}  database は Realtime Database の関数群
 */
export async function initFirebase(config) {
  const [appSdk, authSdk, database] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const profile = getProfile();
  const name = profile ? `kotodama-${profile}` : undefined;
  const existing = appSdk.getApps().find((a) => a.name === (name ?? '[DEFAULT]'));
  const app = existing ?? appSdk.initializeApp(config, name);

  const auth = authSdk.getAuth(app);
  const user = await new Promise((resolve, reject) => {
    const off = authSdk.onAuthStateChanged(auth, (current) => {
      if (current) {
        off();
        resolve(current);
      }
    }, reject);
    // 保存済みのユーザーが無ければ匿名ログイン（あれば onAuthStateChanged が先に呼ばれる）
    auth.authStateReady().then(() => {
      if (!auth.currentUser) authSdk.signInAnonymously(auth).catch(reject);
    });
  });

  const db = database.getDatabase(app, config.databaseURL);
  return { app, db, user, database };
}
