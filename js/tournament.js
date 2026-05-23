// tournament.js
// シングルエリミネーション・トーナメント生成ロジック

/**
 * 進出者数から bracket size（2の累乗）を決める
 */
function bracketSize(entrantCount) {
  let size = 1;
  while (size < entrantCount) size *= 2;
  return Math.max(size, 2);
}

/**
 * 標準シードパターン（1 vs N, 2 vs N-1 ... を最終的に反対側で対戦するように配置）
 * @param {Number} size - bracket size (2の累乗)
 * @returns {Array<Number>} 1始まりのシード番号配列（ブラケット位置順）
 */
function seedPositions(size) {
  let positions = [1, 2];
  while (positions.length < size) {
    const next = [];
    const total = positions.length * 2 + 1;
    positions.forEach((p) => {
      next.push(p);
      next.push(total - p);
    });
    positions = next;
  }
  return positions;
}

/**
 * 全体順位に基づきトーナメント表（1回戦の対戦カード）を生成
 * 不戦勝（bye）がある場合は対戦相手 null
 * @param {Array} rankedFencers - 順位順に並んだ進出者 [{id, name, rank}]
 * @returns {Object} { size, rounds: [[match, match...], ...] }
 */
function generateTournament(rankedFencers) {
  const size = bracketSize(rankedFencers.length);
  const positions = seedPositions(size);
  // ブラケット位置に選手を配置（足りない位置はnull = bye）
  const slots = positions.map((seedNum) => rankedFencers[seedNum - 1] || null);

  const rounds = [];
  let currentRound = [];
  for (let i = 0; i < size; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    currentRound.push({
      round: 1,
      position: i / 2,
      fencerA: a ? a.id : null,
      fencerAName: a ? a.name : null,
      fencerB: b ? b.id : null,
      fencerBName: b ? b.name : null,
      scoreA: 0,
      scoreB: 0,
      completed: false,
      // byeなら自動勝者
      winner: !a && b ? b.id : !b && a ? a.id : null,
    });
  }
  rounds.push(currentRound);

  // 後続ラウンドの空テンプレートを生成
  let prev = currentRound;
  let roundNo = 2;
  while (prev.length > 1) {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push({
        round: roundNo,
        position: i / 2,
        fencerA: null,
        fencerAName: null,
        fencerB: null,
        fencerBName: null,
        scoreA: 0,
        scoreB: 0,
        completed: false,
        winner: null,
      });
    }
    // bye による自動勝者を次ラウンドへ繰り上げ
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1];
      const nextIdx = i / 2;
      if (left && left.winner && (!right || !right.fencerA && !right.fencerB)) {
        next[nextIdx].fencerA = left.winner;
        next[nextIdx].fencerAName = left.fencerAName || left.fencerBName;
      }
    }
    rounds.push(next);
    prev = next;
    roundNo += 1;
  }

  return { size, rounds };
}

/**
 * 試合終了後、勝者を次のラウンドに繰り上げる
 * @param {Object} tournament
 * @param {Number} roundIndex - 0始まり
 * @param {Number} matchIndex
 * @param {Number} scoreA
 * @param {Number} scoreB
 */
function recordTournamentResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const match = tournament.rounds[roundIndex][matchIndex];
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.completed = true;
  match.winner = scoreA > scoreB ? match.fencerA : match.fencerB;
  const winnerName = scoreA > scoreB ? match.fencerAName : match.fencerBName;

  // 次ラウンドの枠に勝者をセット
  const nextRound = tournament.rounds[roundIndex + 1];
  if (!nextRound) return tournament; // 決勝
  const nextIdx = Math.floor(matchIndex / 2);
  const nextMatch = nextRound[nextIdx];
  if (matchIndex % 2 === 0) {
    nextMatch.fencerA = match.winner;
    nextMatch.fencerAName = winnerName;
  } else {
    nextMatch.fencerB = match.winner;
    nextMatch.fencerBName = winnerName;
  }
  return tournament;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bracketSize, seedPositions, generateTournament, recordTournamentResult };
}
