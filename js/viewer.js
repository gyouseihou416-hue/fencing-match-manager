// viewer.js - 観戦画面のロジック（読み取り専用＋リアルタイム同期）
(() => {
  const params = new URLSearchParams(location.search);
  const tournamentId = params.get('id');
  let state = null;

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  if (!tournamentId) {
    document.querySelector('main').innerHTML = '<div class="card empty-state">大会IDが指定されていません。<a href="index.html">大会一覧へ戻る</a></div>';
    return;
  }

  async function start() {
    await window.FMMStore.subscribeTournament(tournamentId, (data) => {
      state = data;
      renderAll();
    });
  }

  function renderAll() {
    if (!state) return;
    updateStatusBar();
    renderLiveMatches();
    renderOverallRank();
    renderTournamentView();
    renderFinalResult();
  }

  function updateStatusBar() {
    const sb = $('#statusBar');
    const live = window.FIREBASE_ENABLED ? '<span class="live">● LIVE</span>' : '⚠ オフライン（運営PC内のみ）';
    sb.innerHTML = `${escapeHtml(state.name || '無題の大会')} | ${escapeHtml(state.date)} | ${weaponLabel(state.weapon)} | 参加${state.fencers.length}名 | ${live}`;
  }

  function weaponLabel(w) { return ({fleuret:'フルーレ', epee:'エペ', sabre:'サーブル'}[w] || ''); }

  function renderLiveMatches() {
    // 各プールの未完了の最初の試合、トーナメントの未完了の試合を抽出
    const container = $('#liveMatches');
    const items = [];
    (state.pools || []).forEach((p) => {
      const ongoing = p.matches.find((m) => !m.completed);
      if (ongoing) {
        items.push(`<div class="match-card">
          <span class="tag">${escapeHtml(p.name)}</span>
          <span class="name">${escapeHtml(ongoing.fencerAName)}</span>
          <strong>${ongoing.scoreA}</strong>
          <span class="vs">vs</span>
          <strong>${ongoing.scoreB}</strong>
          <span class="name">${escapeHtml(ongoing.fencerBName)}</span>
        </div>`);
      }
    });
    if (state.tournament) {
      state.tournament.rounds.forEach((round, ri) => {
        round.forEach((m) => {
          if (!m.completed && m.fencerA && m.fencerB) {
            const roundLabel = roundName(state.tournament.rounds.length, ri);
            items.push(`<div class="match-card">
              <span class="tag">${roundLabel}</span>
              <span class="name">${escapeHtml(m.fencerAName)}</span>
              <strong>${m.scoreA}</strong>
              <span class="vs">vs</span>
              <strong>${m.scoreB}</strong>
              <span class="name">${escapeHtml(m.fencerBName)}</span>
            </div>`);
          }
        });
      });
    }
    if (items.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = state.status === 'done' ? '大会終了' : '進行中の試合はありません';
    } else {
      container.className = '';
      container.innerHTML = items.join('');
    }
  }

  function roundName(total, ri) {
    const names = ['1回戦','2回戦','準々決勝','準決勝','決勝'];
    return names[total - 1 - ri] || `第${ri+1}ラウンド`;
  }

  function renderOverallRank() {
    const container = $('#overallRank');
    if (!state.pools || state.pools.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = 'プール戦未開始';
      return;
    }
    const allStats = state.pools.map(p => calculatePoolStats(p.fencers, p.matches));
    const overall = calculateOverallRanking(allStats);
    container.className = '';
    container.innerHTML = `
      <table>
        <thead>
          <tr><th>順位</th><th>名前</th><th>所属</th>
          <th class="num">V</th><th class="num">V/M</th>
          <th class="num">Ind</th><th class="num">TS</th></tr>
        </thead>
        <tbody>
          ${overall.map(s => `
            <tr class="rank-${s.rank}">
              <td>${s.rank}</td>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.club)}</td>
              <td class="num">${s.V}</td>
              <td class="num">${(s.winRate * 100).toFixed(0)}%</td>
              <td class="num">${s.Ind > 0 ? '+' + s.Ind : s.Ind}</td>
              <td class="num">${s.TS}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderTournamentView() {
    const container = $('#tournamentView');
    if (!state.tournament) {
      container.className = 'tournament-bracket empty-state';
      container.innerHTML = 'トーナメント未開始';
      return;
    }
    container.className = 'tournament-bracket';
    const total = state.tournament.rounds.length;
    container.innerHTML = state.tournament.rounds.map((round, ri) => `
      <div class="tournament-round">
        <h3 style="font-size:0.9rem;color:#6b7280;margin:4px 0">${roundName(total, ri)}</h3>
        ${round.map((m) => {
          const a = m.fencerAName || '<span class="bye">bye</span>';
          const b = m.fencerBName || '<span class="bye">bye</span>';
          const aWin = m.completed && m.winner === m.fencerA ? 'winner' : '';
          const bWin = m.completed && m.winner === m.fencerB ? 'winner' : '';
          return `
            <div class="bracket-match">
              <div class="row ${aWin}"><span>${a}</span><span>${m.scoreA || ''}</span></div>
              <div class="row ${bWin}"><span>${b}</span><span>${m.scoreB || ''}</span></div>
            </div>
          `;
        }).join('')}
      </div>
    `).join('');
  }

  function renderFinalResult() {
    const container = $('#finalResult');
    if (state.status !== 'done' || !state.tournament) {
      container.className = 'empty-state';
      container.innerHTML = '未確定';
      return;
    }
    // 簡易版 final ranking 計算（admin.js と同等ロジック）
    const t = state.tournament;
    const ranking = [];
    const used = new Set();
    const finalMatch = t.rounds[t.rounds.length - 1][0];
    if (finalMatch.completed) {
      const winner = state.fencers.find(f => f.id === finalMatch.winner);
      const loserId = finalMatch.winner === finalMatch.fencerA ? finalMatch.fencerB : finalMatch.fencerA;
      const loser = state.fencers.find(f => f.id === loserId);
      if (winner) { ranking.push({ rank: 1, ...winner }); used.add(winner.id); }
      if (loser) { ranking.push({ rank: 2, ...loser }); used.add(loser.id); }
    }
    let nextRank = 3;
    for (let ri = t.rounds.length - 2; ri >= 0; ri--) {
      const losers = [];
      t.rounds[ri].forEach((m) => {
        if (!m.completed) return;
        const lid = m.winner === m.fencerA ? m.fencerB : m.fencerA;
        if (lid && !used.has(lid)) {
          const f = state.fencers.find(x => x.id === lid);
          if (f) { losers.push(f); used.add(f.id); }
        }
      });
      losers.forEach(f => ranking.push({ rank: nextRank, ...f }));
      nextRank += losers.length;
    }
    container.className = '';
    container.innerHTML = `
      <table>
        <thead><tr><th>順位</th><th>名前</th><th>所属</th></tr></thead>
        <tbody>
          ${ranking.map(r => `<tr class="rank-${r.rank}"><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.club || '')}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  // 検索機能
  $('#btnSearch').addEventListener('click', () => {
    if (!state) return;
    const q = $('#searchName').value.trim().toLowerCase();
    const result = $('#searchResult');
    if (!q) { result.innerHTML = '<p class="hint">名前を入力してください</p>'; return; }
    const fencer = state.fencers.find(f => f.name.toLowerCase().includes(q));
    if (!fencer) { result.innerHTML = '<p class="hint">該当する選手が見つかりません</p>'; return; }
    // プール戦の残り試合
    const remainingPool = [];
    (state.pools || []).forEach((p) => {
      p.matches.forEach((m, idx) => {
        if (!m.completed && (m.fencerA === fencer.id || m.fencerB === fencer.id)) {
          const opponent = m.fencerA === fencer.id ? m.fencerBName : m.fencerAName;
          remainingPool.push(`<li>${escapeHtml(p.name)} 第${idx+1}試合：${escapeHtml(opponent)} と対戦</li>`);
        }
      });
    });
    // トーナメント次の試合
    let tNext = '';
    if (state.tournament) {
      for (const round of state.tournament.rounds) {
        for (const m of round) {
          if (!m.completed && (m.fencerA === fencer.id || m.fencerB === fencer.id)) {
            const opp = m.fencerA === fencer.id ? m.fencerBName : m.fencerAName;
            tNext = `<p>🏆 次のトーナメント試合：<strong>${escapeHtml(opp || '相手未定')}</strong></p>`;
            break;
          }
        }
        if (tNext) break;
      }
    }
    result.innerHTML = `
      <div class="card">
        <h3>${escapeHtml(fencer.name)} さん（${escapeHtml(fencer.club || '所属未登録')}）</h3>
        ${remainingPool.length ? '<p>📌 プール戦の残り：</p><ul>' + remainingPool.join('') + '</ul>' : '<p class="hint">プール戦は完了しています</p>'}
        ${tNext}
      </div>
    `;
  });

  start();
})();
