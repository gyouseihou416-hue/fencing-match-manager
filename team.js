// team.js - 団体戦ロジック（紅白戦／イタリアンリレー）
//
// 公式対戦順（FIE / USA Fencing）:
//   1: 3 vs 6
//   2: 1 vs 5
//   3: 2 vs 4
//   4: 1 vs 6
//   5: 3 vs 4
//   6: 2 vs 5
//   7: 1 vs 4
//   8: 2 vs 6
//   9: 3 vs 5
// 数字は「チームAの選手番号(1-3)」「チームBの選手番号(4-6)→マイナス3した0-2」
// チームA選手 1,2,3 / チームB選手 4,5,6（実体はそれぞれ0,1,2のindex）
const TEAM_BOUT_ORDER = [
  { a: 3, b: 6 }, // bout 1
  { a: 1, b: 5 }, // bout 2
  { a: 2, b: 4 }, // bout 3
  { a: 1, b: 6 }, // bout 4
  { a: 3, b: 4 }, // bout 5
  { a: 2, b: 5 }, // bout 6
  { a: 1, b: 4 }, // bout 7
  { a: 2, b: 6 }, // bout 8
  { a: 3, b: 5 }, // bout 9
];

/**
 * 9試合分の空テンプレートを作る
 */
function createTeamBouts() {
  return TEAM_BOUT_ORDER.map((o, i) => ({
    boutIdx: i,
    playerAIdx: o.a - 1,    // 0-2
    playerBIdx: o.b - 4,    // 0-2
    scoreA: 0,
    scoreB: 0,
    completed: false,
    tieBreakWinner: null,
    winner: null, // 'A' or 'B'
    cumulativeA: 0,
    cumulativeB: 0,
  }));
}

/**
 * 団体戦の試合オブジェクトを生成
 * @param {Object} teamA - {id, name, members: [name1, name2, name3]}
 * @param {Object} teamB
 * @param {String} type - 'team_kohaku' or 'team_relay'
 */
function createTeamMatch(teamA, teamB, type) {
  return {
    id: 'tm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    teamA: teamA.id,
    teamAName: teamA.name,
    teamB: teamB.id,
    teamBName: teamB.name,
    type, // 'team_kohaku' or 'team_relay'
    bouts: createTeamBouts(),
    completed: false,
    winner: null, // 'A' or 'B'
    finalScoreA: 0,
    finalScoreB: 0,
  };
}

/**
 * 1試合分の結果を記録し、累積スコア・勝敗を更新
 * @param {Object} teamMatch
 * @param {Number} boutIdx
 * @param {Number} scoreA - その試合だけのスコア
 * @param {Number} scoreB
 * @param {String|null} tieBreakWinner - 'A'/'B'/null
 */
function recordTeamBout(teamMatch, boutIdx, scoreA, scoreB, tieBreakWinner) {
  const bout = teamMatch.bouts[boutIdx];
  if (!bout) return teamMatch;
  bout.scoreA = scoreA;
  bout.scoreB = scoreB;
  bout.tieBreakWinner = tieBreakWinner || null;
  if (scoreA > scoreB) {
    bout.winner = 'A';
    bout.completed = true;
  } else if (scoreB > scoreA) {
    bout.winner = 'B';
    bout.completed = true;
  } else if (tieBreakWinner === 'A') {
    bout.winner = 'A';
    bout.completed = true;
  } else if (tieBreakWinner === 'B') {
    bout.winner = 'B';
    bout.completed = true;
  } else {
    bout.winner = null;
    bout.completed = false;
  }
  recomputeTeamMatch(teamMatch);
  return teamMatch;
}

/**
 * 累積スコアと勝敗を再計算する
 */
function recomputeTeamMatch(teamMatch) {
  let cumA = 0, cumB = 0;
  let winsA = 0, winsB = 0;
  for (const b of teamMatch.bouts) {
    if (b.completed) {
      cumA += b.scoreA;
      cumB += b.scoreB;
      if (b.winner === 'A') winsA += 1;
      if (b.winner === 'B') winsB += 1;
    }
    b.cumulativeA = cumA;
    b.cumulativeB = cumB;
  }
  if (teamMatch.type === 'team_relay') {
    teamMatch.finalScoreA = cumA;
    teamMatch.finalScoreB = cumB;
    const allDone = teamMatch.bouts.every(b => b.completed);
    if (cumA >= 45) { teamMatch.completed = true; teamMatch.winner = 'A'; }
    else if (cumB >= 45) { teamMatch.completed = true; teamMatch.winner = 'B'; }
    else if (allDone) {
      teamMatch.completed = true;
      teamMatch.winner = cumA > cumB ? 'A' : (cumB > cumA ? 'B' : null);
    } else {
      teamMatch.completed = false;
      teamMatch.winner = null;
    }
  } else {
    // 紅白戦：先に5勝
    teamMatch.finalScoreA = winsA;
    teamMatch.finalScoreB = winsB;
    if (winsA >= 5) { teamMatch.completed = true; teamMatch.winner = 'A'; }
    else if (winsB >= 5) { teamMatch.completed = true; teamMatch.winner = 'B'; }
    else if (teamMatch.bouts.every(b => b.completed)) {
      teamMatch.completed = true;
      teamMatch.winner = winsA > winsB ? 'A' : (winsB > winsA ? 'B' : null);
    } else {
      teamMatch.completed = false;
      teamMatch.winner = null;
    }
  }
  return teamMatch;
}

/**
 * 紅白戦／リレーで、その試合の「目標点数」を返す
 * リレーは累積目標、紅白戦は5本固定
 */
function targetScoreForBout(boutIdx, type) {
  if (type === 'team_relay') return (boutIdx + 1) * 5;
  return 5;
}

/**
 * 団体戦のプール戦を生成（蛇行配分）
 */
function generateTeamPools(teams, poolCount, type) {
  const sorted = [...teams].sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const pools = Array.from({ length: poolCount }, (_, i) => ({
    id: 'tp_' + i + '_' + Date.now().toString(36),
    name: `プール${String.fromCharCode(65 + i)}`,
    teamIds: [],
    matches: [], // {teamAId, teamBId, teamMatchId}
    piste: i + 1,
  }));
  sorted.forEach((team, idx) => {
    const phase = Math.floor(idx / poolCount);
    const pos = idx % poolCount;
    const realPos = phase % 2 === 0 ? pos : poolCount - 1 - pos;
    pools[realPos].teamIds.push(team.id);
  });
  // 各プールで総当たり対戦表を作成
  const teamMatches = [];
  pools.forEach((p) => {
    const ts = p.teamIds.map(id => teams.find(t => t.id === id));
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const tm = createTeamMatch(ts[i], ts[j], type);
        teamMatches.push(tm);
        p.matches.push({ teamAId: ts[i].id, teamBId: ts[j].id, teamMatchId: tm.id });
      }
    }
  });
  return { pools, teamMatches };
}

/**
 * 団体戦プール戦の順位計算
 * 勝数 → 得失点差（リレー）or 勝率 → 得失点
 */
function calculateTeamPoolRanking(teams, teamPool, teamMatches, type) {
  const stats = {};
  teamPool.teamIds.forEach(tid => {
    const t = teams.find(x => x.id === tid);
    stats[tid] = {
      id: tid,
      name: t ? t.name : '?',
      V: 0, M: 0, TS: 0, TR: 0, Ind: 0, winRate: 0,
    };
  });
  teamPool.matches.forEach((m) => {
    const tm = teamMatches.find(x => x.id === m.teamMatchId);
    if (!tm || !tm.completed) return;
    const a = stats[m.teamAId];
    const b = stats[m.teamBId];
    if (!a || !b) return;
    a.M += 1; b.M += 1;
    // TS/TR は累積得点（リレーでも紅白戦でも、ブート単位の合計を使う）
    let totalA = 0, totalB = 0;
    tm.bouts.forEach(bo => { totalA += bo.scoreA; totalB += bo.scoreB; });
    a.TS += totalA; a.TR += totalB;
    b.TS += totalB; b.TR += totalA;
    if (tm.winner === 'A') a.V += 1;
    else if (tm.winner === 'B') b.V += 1;
  });
  Object.values(stats).forEach(s => {
    s.Ind = s.TS - s.TR;
    s.winRate = s.M > 0 ? s.V / s.M : 0;
  });
  const arr = Object.values(stats).sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.Ind !== a.Ind) return b.Ind - a.Ind;
    return b.TS - a.TS;
  });
  return arr.map((s, i) => ({ ...s, rank: i + 1 }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEAM_BOUT_ORDER, createTeamBouts, createTeamMatch, recordTeamBout, recomputeTeamMatch,
    targetScoreForBout, generateTeamPools, calculateTeamPoolRanking,
  };
}
