// team.js - 団体戦ロジック（紅白戦／イタリアンリレー）
//
// 公式対戦順（FIE / USA Fencing）:
//   1: 3 vs 6, 2: 1 vs 5, 3: 2 vs 4, 4: 1 vs 6, 5: 3 vs 4,
//   6: 2 vs 5, 7: 1 vs 4, 8: 2 vs 6, 9: 3 vs 5
const TEAM_BOUT_ORDER = [
  { a: 3, b: 6 },
  { a: 1, b: 5 },
  { a: 2, b: 4 },
  { a: 1, b: 6 },
  { a: 3, b: 4 },
  { a: 2, b: 5 },
  { a: 1, b: 4 },
  { a: 2, b: 6 },
  { a: 3, b: 5 },
];

function createTeamBouts() {
  return TEAM_BOUT_ORDER.map((o, i) => ({
    boutIdx: i,
    playerAIdx: o.a - 1,
    playerBIdx: o.b - 4,
    scoreA: 0,
    scoreB: 0,
    completed: false,
    tieBreakWinner: null,
    winner: null,
    cumulativeA: 0,
    cumulativeB: 0,
    forfeit: null, // 'A' or 'B' - 該当チームの選手が不在による不戦勝
    substitutionA: null, // {fromIdx, beforeBoutIdx} 等、簡易：リザーブ投入後のindex対応
    substitutionB: null,
  }));
}

function countActiveMembers(team) {
  if (!team) return 0;
  const ids = team.memberFencerIds || team.members || [];
  return ids.filter(x => x && (typeof x === 'string' ? x.trim() : true)).length;
}

function createTeamMatch(teamA, teamB, type) {
  const tm = {
    id: 'tm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    teamA: teamA.id,
    teamAName: teamA.name,
    teamB: teamB.id,
    teamBName: teamB.name,
    type,
    bouts: createTeamBouts(),
    completed: false,
    winner: null,
    finalScoreA: 0,
    finalScoreB: 0,
    teamAMemberCount: countActiveMembers(teamA),
    teamBMemberCount: countActiveMembers(teamB),
  };
  // 紅白戦のみ：人員不足時は該当ブートを不戦勝として事前マーク
  applyForfeits(tm, teamA, teamB);
  return tm;
}

/**
 * 不戦勝の自動マーキング（紅白戦のみ）
 * memberFencerIds の空きスロット（'' or null）に当たる選手を含むブートを
 * 5-0の不戦勝として記録する
 */
function applyForfeits(teamMatch, teamA, teamB) {
  if (teamMatch.type !== 'team_kohaku') return; // リレーは3人未満で実施不可
  const isFilledA = (idx) => {
    const arr = (teamA && teamA.memberFencerIds) || (teamA && teamA.members) || [];
    return Boolean(arr[idx] && (typeof arr[idx] === 'string' ? arr[idx].trim() : true));
  };
  const isFilledB = (idx) => {
    const arr = (teamB && teamB.memberFencerIds) || (teamB && teamB.members) || [];
    return Boolean(arr[idx] && (typeof arr[idx] === 'string' ? arr[idx].trim() : true));
  };
  teamMatch.bouts.forEach((b) => {
    const aOK = isFilledA(b.playerAIdx);
    const bOK = isFilledB(b.playerBIdx);
    if (!aOK && bOK) {
      b.scoreA = 0;
      b.scoreB = 5;
      b.winner = 'B';
      b.completed = true;
      b.forfeit = 'A';
    } else if (aOK && !bOK) {
      b.scoreA = 5;
      b.scoreB = 0;
      b.winner = 'A';
      b.completed = true;
      b.forfeit = 'B';
    } else if (!aOK && !bOK) {
      // 両方欠員：勝者なし
      b.completed = true;
      b.winner = null;
      b.forfeit = 'BOTH';
    }
  });
  recomputeTeamMatch(teamMatch);
}

function recordTeamBout(teamMatch, boutIdx, scoreA, scoreB, tieBreakWinner) {
  const bout = teamMatch.bouts[boutIdx];
  if (!bout) return teamMatch;
  // 不戦勝の試合は変更不可
  if (bout.forfeit) return teamMatch;
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
 * リザーブ投入：teamMatch 開始後、次の試合以降からリザーブを使う
 * @param {Object} teamMatch
 * @param {Object} team - teamA or teamB
 * @param {String} side - 'A' or 'B'
 * @param {Number} replacedIdx - 0-2 (元の選手のindex)
 * @param {Number} fromBoutIdx - 0-8 この試合以降から適用
 */
function substituteReserve(teamMatch, team, side, replacedIdx, fromBoutIdx) {
  if (!team || !team.reserveFencerId || team.substitutionUsed) {
    return { ok: false, reason: !team.reserveFencerId ? 'リザーブが未設定です' : 'すでに交代済みです' };
  }
  team.substitutionUsed = true;
  team.substitutedOut = replacedIdx;
  // members[replacedIdx] と reserve を入れ替え（以降の試合は新しい選手が出る）
  const oldName = team.members[replacedIdx];
  const oldId = team.memberFencerIds ? team.memberFencerIds[replacedIdx] : '';
  team.members[replacedIdx] = team.reserve;
  if (team.memberFencerIds) team.memberFencerIds[replacedIdx] = team.reserveFencerId;
  team.reserve = oldName;
  team.reserveFencerId = oldId;
  // teamMatch にメタを記録
  if (!teamMatch.substitutions) teamMatch.substitutions = [];
  teamMatch.substitutions.push({ side, fromBoutIdx, replacedIdx, newName: team.members[replacedIdx] });
  return { ok: true };
}

function targetScoreForBout(boutIdx, type) {
  if (type === 'team_relay') return (boutIdx + 1) * 5;
  return 5;
}

function generateTeamPools(teams, poolCount, type) {
  const sorted = [...teams].sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const pools = Array.from({ length: poolCount }, (_, i) => ({
    id: 'tp_' + i + '_' + Date.now().toString(36),
    name: 'プール' + String.fromCharCode(65 + i),
    teamIds: [],
    matches: [],
    piste: i + 1,
  }));
  sorted.forEach((team, idx) => {
    const phase = Math.floor(idx / poolCount);
    const pos = idx % poolCount;
    const realPos = phase % 2 === 0 ? pos : poolCount - 1 - pos;
    pools[realPos].teamIds.push(team.id);
  });
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

/**
 * リレー実施前のチェック：全チームが3人以上いるか
 * @returns {Array} エラーメッセージ配列（空なら問題なし）
 */
function validateTeamsForRelay(teams) {
  const errors = [];
  teams.forEach(t => {
    if (countActiveMembers(t) < 3) {
      errors.push('チーム「' + t.name + '」は選手が3人未満です（イタリアンリレーには参加できません）');
    }
  });
  return errors;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEAM_BOUT_ORDER, createTeamBouts, createTeamMatch, recordTeamBout, recomputeTeamMatch,
    targetScoreForBout, generateTeamPools, calculateTeamPoolRanking,
    applyForfeits, substituteReserve, validateTeamsForRelay, countActiveMembers,
  };
}
