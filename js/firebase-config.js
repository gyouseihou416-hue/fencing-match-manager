// firebase-config.js
// ▼ 使い方
// 1) https://console.firebase.google.com で新規プロジェクト作成
// 2) Firestore Database を有効化（テストモードでOK／後でルールを締める）
// 3) プロジェクト設定 → 「ウェブアプリ」追加 → 表示される設定値を下の firebaseConfig に貼り付け
// 4) この行のまま GitHub Pages にアップしても動作するが、本番では Firestore のルールで読み取り限定にすることを推奨

window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// Firebase設定が空の場合は localStorage のみで動作（運営者PC内完結モード）
window.FIREBASE_ENABLED = Boolean(window.FIREBASE_CONFIG.apiKey);
