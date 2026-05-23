// store.js
// データ保存層：Firebase が設定されていれば Firestore、なければ localStorage を使用
// admin/viewer 両方から同じ API で呼べる

const STORAGE_PREFIX = 'fmm_tournament_';
const LIST_KEY = 'fmm_tournament_list';

let firestoreDB = null;

async function initFirebaseIfNeeded() {
  if (!window.FIREBASE_ENABLED || firestoreDB) return firestoreDB;
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs, deleteDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const app = initializeApp(window.FIREBASE_CONFIG);
    firestoreDB = {
      db: getFirestore(app),
      doc, setDoc, getDoc, onSnapshot, collection, getDocs, deleteDoc,
    };
    return firestoreDB;
  } catch (e) {
    console.warn('Firebase初期化に失敗。localStorageのみで動作します。', e);
    window.FIREBASE_ENABLED = false;
    return null;
  }
}

function genId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

async function saveTournament(tournament) {
  if (!tournament.id) tournament.id = genId();
  tournament.updatedAt = Date.now();
  // localStorage は常に保存（オフラインフォールバック）
  localStorage.setItem(STORAGE_PREFIX + tournament.id, JSON.stringify(tournament));
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  if (!list.find((t) => t.id === tournament.id)) {
    list.push({ id: tournament.id, name: tournament.name, date: tournament.date });
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  }
  // Firebase
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    await fb.setDoc(fb.doc(fb.db, 'tournaments', tournament.id), tournament);
  }
  return tournament;
}

async function loadTournament(id) {
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      const snap = await fb.getDoc(fb.doc(fb.db, 'tournaments', id));
      if (snap.exists()) {
        const data = snap.data();
        localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn('Firebase読み込み失敗、localStorageを試みます', e);
    }
  }
  const local = localStorage.getItem(STORAGE_PREFIX + id);
  return local ? JSON.parse(local) : null;
}

async function listTournaments() {
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      const snap = await fb.getDocs(fb.collection(fb.db, 'tournaments'));
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, name: data.name, date: data.date, weapon: data.weapon, status: data.status });
      });
      return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (e) {
      console.warn('Firebase一覧取得失敗、localStorageを使用', e);
    }
  }
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  return list.map((t) => {
    const full = JSON.parse(localStorage.getItem(STORAGE_PREFIX + t.id) || '{}');
    return { ...t, weapon: full.weapon, status: full.status };
  });
}

async function deleteTournament(id) {
  localStorage.removeItem(STORAGE_PREFIX + id);
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  localStorage.setItem(LIST_KEY, JSON.stringify(list.filter((t) => t.id !== id)));
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      await fb.deleteDoc(fb.doc(fb.db, 'tournaments', id));
    } catch (e) {
      console.warn('Firebase削除失敗', e);
    }
  }
}

/**
 * リアルタイム監視（viewer用）。callback には tournament オブジェクトが渡される
 * @returns {Function} 解除関数
 */
async function subscribeTournament(id, callback) {
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    return fb.onSnapshot(fb.doc(fb.db, 'tournaments', id), (snap) => {
      if (snap.exists()) callback(snap.data());
    });
  }
  // Firebase未設定時：localStorage変更を3秒ごとにポーリング
  let last = null;
  const timer = setInterval(async () => {
    const data = await loadTournament(id);
    if (data && JSON.stringify(data) !== last) {
      last = JSON.stringify(data);
      callback(data);
    }
  }, 3000);
  // 初回呼び出し
  loadTournament(id).then((d) => d && callback(d));
  return () => clearInterval(timer);
}

window.FMMStore = {
  saveTournament,
  loadTournament,
  listTournaments,
  deleteTournament,
  subscribeTournament,
  genId,
};
