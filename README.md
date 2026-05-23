# ⚔️ フェンシング試合管理システム

無料・気軽に使える、フェンシング大会のプール戦＆トーナメント戦管理ツール。
URL一つで運営も観客もアクセスできる軽量Webアプリです。

## 特徴

- **完全無料**：GitHub Pages + Firebase 無料枠で運用
- **公式準拠**：FIE準拠の順位計算（V/M/Ind/TS）
- **3剣種対応**：フルーレ・エペ・サーブル
- **リアルタイム観戦**：観客はスマホで進行状況をライブ確認
- **オフラインでも動く**：Firebase未設定でも運営PC内で完結
- **インストール不要**：ブラウザだけで使える

## デモ

`https://<あなたのGitHubユーザー名>.github.io/fencing-match-manager/`

## 5分で公開する手順

### ステップ1：GitHubリポジトリを作る

1. GitHubで「New repository」をクリック
2. リポジトリ名：`fencing-match-manager`（任意）
3. Public で作成

### ステップ2：このコードをアップロード

方法A：GitHub Web画面から
1. 「uploading an existing file」をクリック
2. `fencing-match-manager` フォルダ内のすべてのファイルをドラッグ＆ドロップ
3. Commit

方法B：Gitコマンド
```bash
git clone https://github.com/<あなたのユーザー名>/fencing-match-manager.git
cp -r fencing-match-manager/* .
git add .
git commit -m "init"
git push
```

### ステップ3：GitHub Pages を有効化

1. リポジトリの Settings → Pages
2. Source：「Deploy from a branch」
3. Branch：`main` / `/ (root)` → Save
4. 数分後 `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開

### ステップ4（任意）：Firebase を設定してリアルタイム同期を有効化

リアルタイム観戦機能を使いたい場合のみ必要。設定しなければ運営PC内のみで動作します。

1. [Firebase Console](https://console.firebase.google.com/) で「プロジェクトを追加」
2. プロジェクト名：任意（例：`fencing-tournament`）
3. Google Analytics は不要
4. 左メニュー「Build → Firestore Database」→「データベースの作成」
5. ロケーション：`asia-northeast1`（東京）推奨
6. 「テストモードで開始」→ 30日間誰でも読み書き可（本番では下記のルールに切り替え）
7. プロジェクト設定（左メニュー上部の歯車）→「マイアプリ」→ ウェブアプリ追加
8. 表示される `firebaseConfig` の値を `js/firebase-config.js` に貼り付け

```js
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSy...',
  authDomain: 'fencing-tournament.firebaseapp.com',
  projectId: 'fencing-tournament',
  storageBucket: 'fencing-tournament.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef',
};
```

#### 推奨：Firestore セキュリティルール（運営者のみ書き込み）

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tournaments/{id} {
      // 読み取りは誰でもOK（観客閲覧用）
      allow read: if true;
      // 書き込みは限定したい場合は認証を加える（簡易版は誰でも可）
      allow write: if true;
    }
  }
}
```

> **注意**：完全公開だと第三者が書き込めるため、本番運用では Firebase Authentication で運営者のみ書き込み可にすることを推奨。

## 使い方

### 運営者の流れ

1. トップページ → 「新規大会作成」
2. ① 大会情報を入力（大会名・日付・剣種・点数設定）→ 保存
3. ② 参加者を登録（手入力 or CSV一括）
4. ③ プール数を決めて「プール自動生成」→ 各試合のスコアを入力→ 確定
5. ④ 進出人数を決めて「トーナメント表生成」→ 試合スコアを入力→ 確定
6. ⑤ 結果ページで順位確認 → CSV/JSONでエクスポート

### 観客・選手の流れ

1. 運営から共有された `viewer.html?id=...` のURLを開く
2. 現在進行中の試合・暫定順位・トーナメント表が自動更新
3. 「自分の次の試合を探す」で名前検索すると次の対戦相手が分かる

## ファイル構成

```
fencing-match-manager/
├── index.html         # 大会一覧（入口）
├── admin.html         # 運営画面
├── viewer.html        # 観客画面
├── css/style.css      # 共通スタイル
├── js/
│   ├── firebase-config.js  # Firebase接続設定
│   ├── store.js            # データ保存層（Firebase/localStorage）
│   ├── ranking.js          # 順位計算ロジック
│   ├── pool.js             # プール戦振り分け＆対戦順
│   ├── tournament.js       # トーナメント生成
│   ├── admin.js            # 運営画面ロジック
│   └── viewer.js           # 観客画面ロジック
├── README.md
├── LICENSE (MIT)
└── .gitignore
```

## カスタマイズのヒント

- **見た目を変える**：`css/style.css` の `:root` 内のカラー変数を変更
- **対戦順を変える**：`js/pool.js` の `POOL_ORDERS` を編集（FIE公式表に準拠）
- **得点ルールを増やす**：大会情報の「点数設定」を変更

## よくある質問

**Q. 有料の Fencing Time との違いは？**
A. 機能はシンプルですが、無料・インストール不要・オープンソース。学校・部活・地域大会向けの軽量版です。

**Q. オフライン会場でも使える？**
A. はい。Firebaseを使わなければ運営PCのブラウザ内で完結します。ただしその場合観客のスマホからは見えません。

**Q. データはどこに保存される？**
A. ブラウザのlocalStorage（運営PC内）と、Firebase設定時はFirestore（クラウド）。

**Q. 何人まで対応？**
A. 理論上無制限ですが、現実的には1大会100名程度を想定。

## ライセンス

MIT License - 自由に改変・再配布可能です。

## 貢献

Issue・Pull Request 大歓迎です。フェンシング業界の改善にぜひご協力ください。

## 関連リンク

- [国際フェンシング連盟（FIE）公式ルール](https://fie.org/fie/documents/rules)
- [日本フェンシング協会](https://fencing-jpn.jp/)
- [Firebase 無料枠の制限](https://firebase.google.com/pricing)
- [GitHub Pages ガイド](https://docs.github.com/ja/pages)
