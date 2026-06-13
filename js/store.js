// store.js - データ保存層（マルチテナント対応）
//
// テナント分離：
// - localStorage: fmm_{tenantId}_tournament_{id}, fmm_{tenantId}_list
// - Firestore:   tenants/{tenantId}/tournaments/{id}
// - テナント未設定の場合は legacy パス（fmm_tournament_*, tournaments/*）

function getTenantId() {
  return (window.FMSTenant && window.FMSTenant.getId && window.FMSTenant.getId()) || null;
}

function getStoragePrefix() {
  const tid = getTenantId();
  return tid ? ('fmm_' + tid + '_tournament_') : 'fmm_tournament_';
}

function getListKey() {
  const tid = getTenantId();
  return tid ? ('fmm_' + tid + '_list') : 'fmm_tournament_list';
}

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

// Firestore は配列の中に配列を入れられないので、tournament.rounds の各要素を
// {matches:[...]}でラップしてから保存し、読み込み時に元の配列に戻す
function toFirestoreSafe(data) {
  if (!data) return data;
  const clone = JSON.parse(JSON.stringify(data));
  if (clone.tournament && Array.isArray(clone.tournament.rounds)) {
    clone.tournament.rounds = clone.tournament.rounds.map((r) => {
      if (Array.isArray(r)) return { matches: r };
      return r;
    });
  }
  return clone;
}

function fromFirestore(data) {
  if (!data) return data;
  if (data.tournament && Array.isArray(data.tournament.rounds)) {
    data.tournament.rounds = data.tournament.rounds.map((r) => {
      if (r && Array.isArray(r.matches)) return r.matches;
      if (Array.isArray(r)) return r;
      return r;
    });
  }
  return data;
}

/**
 * Firestoreの大会ドキュメント参照を返す（テナント有無で path 切替）
 */
function fbTournamentDoc(fb, id) {
  const tid = getTenantId();
  return tid
    ? fb.doc(fb.db, 'tenants', tid, 'tournaments', id)
    : fb.doc(fb.db, 'tournaments', id);
}
function fbTournamentCollection(fb) {
  const tid = getTenantId();
  return tid
    ? fb.collection(fb.db, 'tenants', tid, 'tournaments')
    : fb.collection(fb.db, 'tournaments');
}

async function saveTournament(tournament) {
  if (!tournament.id) tournament.id = genId();
  tournament.updatedAt = Date.now();
  const STORAGE_PREFIX = getStoragePrefix();
  const LIST_KEY = getListKey();
  localStorage.setItem(STORAGE_PREFIX + tournament.id, JSON.stringify(tournament));
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  if (!list.find((t) => t.id === tournament.id)) {
    list.push({ id: tournament.id, name: tournament.name, date: tournament.date });
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  }
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      const safe = toFirestoreSafe(tournament);
      await fb.setDoc(fbTournamentDoc(fb, tournament.id), safe);
    } catch (e) {
      console.error('Firebase保存失敗:', e);
      throw e;
    }
  }
  return tournament;
}

async function loadTournament(id) {
  const STORAGE_PREFIX = getStoragePrefix();
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      const snap = await fb.getDoc(fbTournamentDoc(fb, id));
      if (snap.exists()) {
        const data = fromFirestore(snap.data());
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
  const LIST_KEY = getListKey();
  const STORAGE_PREFIX = getStoragePrefix();
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      const snap = await fb.getDocs(fbTournamentCollection(fb));
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, name: data.name, date: data.date, weapon: data.weapon, status: data.status, type: data.type });
      });
      return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (e) {
      console.warn('Firebase一覧取得失敗、localStorageを使用', e);
    }
  }
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  return list.map((t) => {
    const full = JSON.parse(localStorage.getItem(STORAGE_PREFIX + t.id) || '{}');
    return { ...t, weapon: full.weapon, status: full.status, type: full.type };
  });
}

async function deleteTournament(id) {
  const STORAGE_PREFIX = getStoragePrefix();
  const LIST_KEY = getListKey();
  localStorage.removeItem(STORAGE_PREFIX + id);
  const list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
  localStorage.setItem(LIST_KEY, JSON.stringify(list.filter((t) => t.id !== id)));
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    try {
      await fb.deleteDoc(fbTournamentDoc(fb, id));
    } catch (e) {
      console.warn('Firebase削除失敗', e);
    }
  }
}

async function subscribeTournament(id, callback) {
  const fb = await initFirebaseIfNeeded();
  if (fb) {
    return fb.onSnapshot(fbTournamentDoc(fb, id), (snap) => {
      if (snap.exists()) callback(fromFirestore(snap.data()));
    });
  }
  let last = null;
  const timer = setInterval(async () => {
    const data = await loadTournament(id);
    if (data && JSON.stringify(data) !== last) {
      last = JSON.stringify(data);
      callback(data);
    }
  }, 3000);
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
