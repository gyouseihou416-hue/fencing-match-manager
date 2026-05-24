// tournament.js
// シングルエリミネーション・トーナメント生成ロジック

function bracketSize(entrantCount) {
  let size = 1;
  while (size < entrantCount) size *= 2;
  return Math.max(size, 2);
}

/**
 * FIE標準のトーナメント配置を返す（バランスドブラケット）
 * - 1位は最上段、2位は最下段
 * - 各ラウンドで「対戦相手のシード = ブラケット+1 - 自分のシード」となる
 *   例: 8ブラケット → [1, 8, 5, 4, 3, 6, 7, 2]
 *        16ブラケット → [1,16,9,8,5,12,13,4,3,14,11,6,7,10,15,2]
 *
 * 出典: FIE Organisation rules / Academy of Fencing Masters
 *   https://academyoffencingmasters.com/blog/fencing-tournament-seeding/
 *   https://static.fie.org/uploads/26/131729-Organisation%20rules%20ang.pdf
 */
function seedPositions(size) {
  let positions = [1, 2];
  while (positions.length < size) {
    const next = [];
    const total = positions.length * 2 + 1;
    positions.forEach((p, idx) => {
      // 偶数位置：(s, N+1-s)、奇数位置：(N+1-s, s) で展開
      // これにより上位シードが交互に上半分・下半分に分散され、
      // 1位は最上段、2位は最下段、3位は下半分の上、4位は上半分の下…となる
      if (idx % 2 === 0) {
        next.push(p);
        next.push(total - p);
      } else {
        next.push(total - p);
        next.push(p);
      }
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
    // bye決着：片方が空席なら即勝利
    let winner = null;
    let completed = false;
    if (!a && b) { winner = b.id; completed = true; }
    else if (!b && a) { winner = a.id; completed = true; }
    else if (!a && !b) { winner = null; completed = true; } // 両空席（bye同士）
    currentRound.push({
      round: 1,
      position: i / 2,
      fencerA: a ? a.id : null,
      fencerAName: a ? a.name : null,
      fencerB: b ? b.id : null,
      fencerBName: b ? b.name : null,
      scoreA: 0,
      scoreB: 0,
      completed,
      tieBreakWinner: null,
      winner,
    });
  }
  rounds.push(currentRound);

  let prev = currentRound;
  let roundNo = 2;
  while (prev.length > 1) {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1];
      const m = {
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
      };
      // 前ラウンドのbye決着勝者を反映（左→fencerA、右→fencerB）
      if (left && left.completed && left.winner) {
        m.fencerA = left.winner;
        m.fencerAName = left.winner === left.fencerA ? left.fencerAName : left.fencerBName;
      }
      if (right && right.completed && right.winner) {
        m.fencerB = right.winner;
        m.fencerBName = right.winner === right.fencerA ? right.fencerAName : right.fencerBName;
      }
      // 当ラウンドもbye決着（片方しか上がってこなかった）
      const hasA = !!m.fencerA;
      const hasB = !!m.fencerB;
      const leftDone = left && left.completed; // 上位試合の決着済み
      const rightDone = right && right.completed;
      if (leftDone && rightDone) {
        if (hasA && !hasB) { m.winner = m.fencerA; m.completed = true; }
        else if (!hasA && hasB) { m.winner = m.fencerB; m.completed = true; }
        else if (!hasA && !hasB) { m.winner = null; m.completed = true; }
      }
      next.push(m);
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

  // 色定義（CSS非依存：どのページでも同じ表示）
  const COLOR = {
    boxFill: '#ffffff',
    boxFillDone: '#f0fdf4',
    boxStroke: '#d1d5db',
    nameText: '#111827',
    winnerText: '#b91c1c',
    byeText: '#9ca3af',
    scoreText: '#111827',
    lineWon: '#b91c1c',
    linePending: '#d1d5db',
    midLine: '#e5e7eb',
    roundLabel: '#6b7280',
  };

  let parts = [];
  parts.push('<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" style="font-family: system-ui, sans-serif;">');

  // ラウンド名
  for (let ri = 0; ri < total; ri++) {
    const nm = roundLabel(total, ri);
    const x = ri * (opts.matchWidth + opts.roundGap) + 10 + opts.matchWidth / 2;
    parts.push('<text x="' + x + '" y="18" text-anchor="middle" font-size="13" font-weight="bold" fill="' + COLOR.roundLabel + '">' + esc(nm) + '</text>');
  }

  // 接続線
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
      const topWon = top.match.completed && top.match.winner;
      const botWon = bot.match.completed && bot.match.winner;
      const topStroke = topWon ? COLOR.lineWon : COLOR.linePending;
      const botStroke = botWon ? COLOR.lineWon : COLOR.linePending;
      const topWidth = topWon ? 3 : 2;
      const botWidth = botWon ? 3 : 2;
      const topDash = topWon ? '' : ' stroke-dasharray="4 4"';
      const botDash = botWon ? '' : ' stroke-dasharray="4 4"';
      parts.push('<polyline points="' + x1 + ',' + topY + ' ' + midX + ',' + topY + ' ' + midX + ',' + targetY + ' ' + x2 + ',' + targetY + '" fill="none" stroke="' + topStroke + '" stroke-width="' + topWidth + '"' + topDash + ' />');
      parts.push('<polyline points="' + x1 + ',' + botY + ' ' + midX + ',' + botY + ' ' + midX + ',' + targetY + '" fill="none" stroke="' + botStroke + '" stroke-width="' + botWidth + '"' + botDash + ' />');
    }
  }

  // 試合ボックス＋選手名
  const truncate = (s) => s.length > 14 ? s.slice(0, 13) + '…' : s;
  for (let ri = 0; ri < total; ri++) {
    rounds[ri].forEach((slot) => {
      const m = slot.match;
      const boxFill = m.completed ? COLOR.boxFillDone : COLOR.boxFill;
      parts.push('<rect x="' + slot.x + '" y="' + slot.y + '" width="' + slot.width + '" height="' + slot.height + '" rx="4" fill="' + boxFill + '" stroke="' + COLOR.boxStroke + '" stroke-width="1" />');
      parts.push('<line x1="' + slot.x + '" y1="' + (slot.y + slot.height/2) + '" x2="' + (slot.x + slot.width) + '" y2="' + (slot.y + slot.height/2) + '" stroke="' + COLOR.midLine + '" stroke-width="1" />');

      const aWin = m.completed && m.winner === m.fencerA;
      const bWin = m.completed && m.winner === m.fencerB;
      const aTie = m.tieBreakWinner === 'A' ? ' V' : '';
      const bTie = m.tieBreakWinner === 'B' ? ' V' : '';
      const aText = (m.fencerAName || 'bye') + aTie;
      const bText = (m.fencerBName || 'bye') + bTie;
      const aFill = !m.fencerAName ? COLOR.byeText : (aWin ? COLOR.winnerText : COLOR.nameText);
      const bFill = !m.fencerBName ? COLOR.byeText : (bWin ? COLOR.winnerText : COLOR.nameText);
      const aWeight = aWin ? 'bold' : 'normal';
      const bWeight = bWin ? 'bold' : 'normal';
      const aStyle = !m.fencerAName ? ' font-style="italic"' : '';
      const bStyle = !m.fencerBName ? ' font-style="italic"' : '';
      parts.push('<text x="' + (slot.x + 6) + '" y="' + (slot.y + slot.height/2 - 6) + '" font-size="12" fill="' + aFill + '" font-weight="' + aWeight + '"' + aStyle + '>' + esc(truncate(aText)) + '</text>');
      parts.push('<text x="' + (slot.x + 6) + '" y="' + (slot.y + slot.height - 8) + '" font-size="12" fill="' + bFill + '" font-weight="' + bWeight + '"' + bStyle + '>' + esc(truncate(bText)) + '</text>');
      if (m.completed && (m.fencerA || m.fencerB)) {
        // bye完了の場合は得点を出さない（0-0の表示を避ける）
        const hasRealScore = m.scoreA > 0 || m.scoreB > 0 || (m.fencerA && m.fencerB);
        if (hasRealScore) {
          parts.push('<text x="' + (slot.x + slot.width - 6) + '" y="' + (slot.y + slot.height/2 - 6) + '" text-anchor="end" font-size="12" font-weight="bold" fill="' + COLOR.scoreText + '">' + m.scoreA + '</text>');
          parts.push('<text x="' + (slot.x + slot.width - 6) + '" y="' + (slot.y + slot.height - 8) + '" text-anchor="end" font-size="12" font-weight="bold" fill="' + COLOR.scoreText + '">' + m.scoreB + '</text>');
        }
      }
    });
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * bye自動進出の修復：旧バージョンで生成された既存トーナメントを
 * 非破壊的にカスケード反映する。既に試合結果がある箇所は触らない。
 * @returns {boolean} 何か変更があれば true
 */
function repairBracketCascade(tournament) {
  if (!tournament || !tournament.rounds) return false;
  let changed = false;
  const rounds = tournament.rounds;
  // 第1ラウンドでbye決着なのにcompletedになっていないものを補正
  rounds[0].forEach((m) => {
    if (!m.completed) {
      if (!m.fencerA && m.fencerB) { m.winner = m.fencerB; m.completed = true; changed = true; }
      else if (m.fencerA && !m.fencerB) { m.winner = m.fencerA; m.completed = true; changed = true; }
      else if (!m.fencerA && !m.fencerB) { m.winner = null; m.completed = true; changed = true; }
    }
  });
  // 上のラウンドへ順番に反映
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const cur = rounds[ri];
    const nxt = rounds[ri + 1];
    for (let mi = 0; mi < cur.length; mi += 2) {
      const left = cur[mi];
      const right = cur[mi + 1];
      const target = nxt[mi / 2];
      if (left && left.completed && left.winner && !target.fencerA) {
        target.fencerA = left.winner;
        target.fencerAName = left.winner === left.fencerA ? left.fencerAName : left.fencerBName;
        changed = true;
      }
      if (right && right.completed && right.winner && !target.fencerB) {
        target.fencerB = right.winner;
        target.fencerBName = right.winner === right.fencerA ? right.fencerAName : right.fencerBName;
        changed = true;
      }
      // 当試合もbye決着の判定
      const leftDone = left && left.completed;
      const rightDone = right && right.completed;
      if (leftDone && rightDone && !target.completed) {
        const hasA = !!target.fencerA;
        const hasB = !!target.fencerB;
        if (hasA && !hasB) { target.winner = target.fencerA; target.completed = true; changed = true; }
        else if (!hasA && hasB) { target.winner = target.fencerB; target.completed = true; changed = true; }
        else if (!hasA && !hasB) { target.winner = null; target.completed = true; changed = true; }
      }
    }
  }
  return changed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bracketSize, seedPositions, generateTournament, recordTournamentResult, computeBracketLayout, renderBracketSvg, roundLabel, repairBracketCascade };
}
