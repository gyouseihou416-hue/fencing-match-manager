// tournament.js
// シングルエリミネーション・トーナメント生成ロジック

function bracketSize(entrantCount) {
  let size = 1;
  while (size < entrantCount) size *= 2;
  return Math.max(size, 2);
}

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

function generateTournament(rankedFencers) {
  const size = bracketSize(rankedFencers.length);
  const positions = seedPositions(size);
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
      tieBreakWinner: null,
      winner: !a && b ? b.id : !b && a ? a.id : null,
    });
  }
  rounds.push(currentRound);

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
        tieBreakWinner: null,
        winner: null,
      });
    }
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

function recordTournamentResult(tournament, roundIndex, matchIndex, scoreA, scoreB, tieBreakWinner) {
  const match = tournament.rounds[roundIndex][matchIndex];
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.tieBreakWinner = tieBreakWinner || null;
  if (scoreA > scoreB) {
    match.winner = match.fencerA;
    match.completed = true;
  } else if (scoreB > scoreA) {
    match.winner = match.fencerB;
    match.completed = true;
  } else if (tieBreakWinner === 'A') {
    match.winner = match.fencerA;
    match.completed = true;
  } else if (tieBreakWinner === 'B') {
    match.winner = match.fencerB;
    match.completed = true;
  } else {
    match.winner = null;
    match.completed = false;
    return tournament;
  }
  const winnerName = match.winner === match.fencerA ? match.fencerAName : match.fencerBName;

  const nextRound = tournament.rounds[roundIndex + 1];
  if (!nextRound) return tournament;
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

/**
 * ラウンド名を返す（決勝・準決勝・準々決勝・N回戦）
 */
function roundLabel(total, ri) {
  const fromLast = total - 1 - ri;
  const lateNames = ['決勝', '準決勝', '準々決勝', '準々々決勝'];
  if (fromLast < lateNames.length) return lateNames[fromLast];
  return (ri + 1) + '回戦';
}

function computeBracketLayout(tournament, opts) {
  const o = Object.assign({
    matchWidth: 180,
    matchHeight: 50,
    roundGap: 40,
    vGap: 12,
    topPad: 30,
  }, opts || {});
  const rounds = tournament.rounds;
  const r0 = rounds[0];
  const totalHeight = r0.length * (o.matchHeight + o.vGap) + o.topPad + 10;
  const layout = [];
  for (let ri = 0; ri < rounds.length; ri++) {
    const x = ri * (o.matchWidth + o.roundGap) + 10;
    const row = rounds[ri].map((m, mi) => {
      let y;
      if (ri === 0) {
        y = mi * (o.matchHeight + o.vGap) + o.topPad;
      } else {
        const prev = layout[ri - 1];
        const top = prev[mi * 2];
        const bot = prev[mi * 2 + 1];
        y = (top.y + bot.y) / 2;
      }
      return { x, y, width: o.matchWidth, height: o.matchHeight, match: m };
    });
    layout.push(row);
  }
  const width = rounds.length * (o.matchWidth + o.roundGap) + 10;
  return { width, height: totalHeight, rounds: layout, opts: o };
}

function renderBracketSvg(tournament, escapeHtml) {
  const esc = escapeHtml || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const layout = computeBracketLayout(tournament);
  const { width, height, rounds, opts } = layout;
  const total = rounds.length;

  let parts = [];
  parts.push('<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">');

  for (let ri = 0; ri < total; ri++) {
    const nm = roundLabel(total, ri);
    const x = ri * (opts.matchWidth + opts.roundGap) + 10 + opts.matchWidth / 2;
    parts.push('<text x="' + x + '" y="18" text-anchor="middle" class="round-label">' + esc(nm) + '</text>');
  }

  for (let ri = 0; ri < total - 1; ri++) {
    const cur = rounds[ri];
    const nxt = rounds[ri + 1];
    for (let mi = 0; mi < cur.length; mi += 2) {
      const top = cur[mi];
      const bot = cur[mi + 1];
      const target = nxt[mi / 2];
      const x1 = top.x + top.width;
      const x2 = target.x;
      const midX = (x1 + x2) / 2;
      const topY = top.y + top.height / 2;
      const botY = bot.y + bot.height / 2;
      const targetY = target.y + target.height / 2;
      const topWon = top.match.winner && top.match.completed ? 'won' : 'pending';
      const botWon = bot.match.winner && bot.match.completed ? 'won' : 'pending';
      parts.push('<polyline class="bracket-line ' + topWon + '" points="' + x1 + ',' + topY + ' ' + midX + ',' + topY + ' ' + midX + ',' + targetY + ' ' + x2 + ',' + targetY + '" />');
      parts.push('<polyline class="bracket-line ' + botWon + '" points="' + x1 + ',' + botY + ' ' + midX + ',' + botY + ' ' + midX + ',' + targetY + '" />');
    }
  }

  for (let ri = 0; ri < total; ri++) {
    rounds[ri].forEach((slot) => {
      const m = slot.match;
      const completedClass = m.completed ? 'completed' : '';
      parts.push('<rect class="bracket-box ' + completedClass + '" x="' + slot.x + '" y="' + slot.y + '" width="' + slot.width + '" height="' + slot.height + '" rx="4" />');
      parts.push('<line x1="' + slot.x + '" y1="' + (slot.y + slot.height/2) + '" x2="' + (slot.x + slot.width) + '" y2="' + (slot.y + slot.height/2) + '" stroke="#e5e7eb" stroke-width="1" />');

      const aWin = m.completed && m.winner === m.fencerA;
      const bWin = m.completed && m.winner === m.fencerB;
      const aTie = m.tieBreakWinner === 'A' ? ' V' : '';
      const bTie = m.tieBreakWinner === 'B' ? ' V' : '';
      const aText = (m.fencerAName || 'bye') + aTie;
      const bText = (m.fencerBName || 'bye') + bTie;
      const aClass = !m.fencerAName ? 'bracket-name bye' : (aWin ? 'bracket-name winner' : 'bracket-name');
      const bClass = !m.fencerBName ? 'bracket-name bye' : (bWin ? 'bracket-name winner' : 'bracket-name');
      const truncate = (s) => s.length > 14 ? s.slice(0, 13) + '…' : s;
      parts.push('<text class="' + aClass + '" x="' + (slot.x + 6) + '" y="' + (slot.y + slot.height/2 - 6) + '">' + esc(truncate(aText)) + '</text>');
      parts.push('<text class="' + bClass + '" x="' + (slot.x + 6) + '" y="' + (slot.y + slot.height - 8) + '">' + esc(truncate(bText)) + '</text>');
      if (m.completed) {
        parts.push('<text class="bracket-score" x="' + (slot.x + slot.width - 6) + '" y="' + (slot.y + slot.height/2 - 6) + '" text-anchor="end">' + m.scoreA + '</text>');
        parts.push('<text class="bracket-score" x="' + (slot.x + slot.width - 6) + '" y="' + (slot.y + slot.height - 8) + '" text-anchor="end">' + m.scoreB + '</text>');
      }
    });
  }

  parts.push('</svg>');
  return parts.join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bracketSize, seedPositions, generateTournament, recordTournamentResult, computeBracketLayout, renderBracketSvg, roundLabel };
}
