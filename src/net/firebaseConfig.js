// Firebase の設定値（Firebase コンソール → プロジェクトの設定 → マイアプリ → SDK の設定と構成 → 「構成」）。
// これらはブラウザに公開される前提の値で、秘密情報ではない（データは database.rules.json のアクセスルールで守る）。
// null にすると、フレンド対戦は通信なし（同じブラウザ内だけ）で動く。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDOUI7prTUndJJrtIJQj6vJt3J6BQ2FhV4',
  authDomain: 'kotodama-battle.firebaseapp.com',
  databaseURL: 'https://kotodama-battle-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kotodama-battle',
  storageBucket: 'kotodama-battle.firebasestorage.app',
  messagingSenderId: '58139346607',
  appId: '1:58139346607:web:e68d669a4067268204365a',
};
