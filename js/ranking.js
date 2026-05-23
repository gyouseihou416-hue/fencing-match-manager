// ranking.js
// FIE 公式準拠の順位計算ロジック
// 優先順位: 1) V/M（勝率） 2) Ind = TS - TR（指数） 3) TS（得点数）

function calculatePoolStats(fencers, matches) {
  const stats = {};
  fencers.forEach((f) => {
    stats[f.id] = {
      id: f.id,
      name: f.name,
      club: f.club || '',
      V: 0,
      M: 0,
      TS: 0,
      TR: 0,
      Ind: 0,
      winRate: 0,
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
    if (m.scoreA > m.scoreB) {
      a.V += 1;
    } else if (m.scoreB > m.scoreA) {
      b.V += 1;
    } else {
      // 同点の場合は延長戦勝者を確認
      if (m.tieBreakWinner === 'A') a.V += 1;
      else if (m.tieBreakWinner === 'B') b.V += 1;
      // 未指定の同点は両者ともV加算なし（引き分け扱い）
    }
  });

  Object.values(stats).forEach((s) => {
    s.Ind = s.TS - s.TR;
    s.winRate = s.M > 0 ? s.V / s.M : 0;
  });

  return Object.values(stats);
}

function sortByRanking(stats) {
  return [...stats].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.Ind !== a.Ind) return b.Ind - a.Ind;
    if (b.TS !== a.TS) return b.TS - a.TS;
    return 0;
  });
}

function calculateOverallRanking(poolStatsList) {
  const all = poolStatsList.flat();
  const sorted = sortByRanking(all);
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculatePoolStats, sortByRanking, calculateOverallRanking };
}
