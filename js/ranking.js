// ranking.js
// FIE 公式準拠の順位計算ロジック
// 優先順位: 1) V/M（勝率） 2) Ind = TS - TR（指数） 3) TS（得点数）

/**
 * プール戦の選手ごとの集計を計算する
 * @param {Array} fencers - [{id, name, club, ...}]
 * @param {Array} matches - [{fencerA, fencerB, scoreA, scoreB, completed}]
 * @returns {Array} 各選手の {id, V, M, TS, TR, Ind, winRate}
 */
function calculatePoolStats(fencers, matches) {
  const stats = {};
  fencers.forEach((f) => {
    stats[f.id] = {
      id: f.id,
      name: f.name,
      club: f.club || '',
      V: 0, // 勝利数
      M: 0, // 試合数（完了試合のみカウント）
      TS: 0, // 得点合計
      TR: 0, // 失点合計
      Ind: 0, // 指数 TS - TR
      winRate: 0, // V / M
    };
  });

  matches.forEach((m) => {
    if (!m.completed) return;
    const a = stats[m.fencerA];
    const b = stats[m.fencerB];
    if (!a || !b) return;
    a.M += 1;
    b.M += 1;
    a.TS += m.scoreA;
    a.TR += m.scoreB;
    b.TS += m.scoreB;
    b.TR += m.scoreA;
    if (m.scoreA > m.scoreB) a.V += 1;
    else if (m.scoreB > m.scoreA) b.V += 1;
  });

  Object.values(stats).forEach((s) => {
    s.Ind = s.TS - s.TR;
    s.winRate = s.M > 0 ? s.V / s.M : 0;
  });

  return Object.values(stats);
}

/**
 * 統計を公式順位ルールでソート
 * 1) 勝率 V/M 降順
 * 2) 指数 Ind 降順
 * 3) 得点 TS 降順
 */
function sortByRanking(stats) {
  return [...stats].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.Ind !== a.Ind) return b.Ind - a.Ind;
    if (b.TS !== a.TS) return b.TS - a.TS;
    return 0;
  });
}

/**
 * 複数プールの選手を全体順位にまとめる
 * @param {Array<Array>} poolStatsList - 各プールのstats配列
 * @returns {Array} 全体ランキング（順位フィールド付き）
 */
function calculateOverallRanking(poolStatsList) {
  const all = poolStatsList.flat();
  const sorted = sortByRanking(all);
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}

// ブラウザとNode両対応
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculatePoolStats, sortByRanking, calculateOverallRanking };
}
