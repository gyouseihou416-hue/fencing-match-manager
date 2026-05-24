// viewer.js - 観戦画面のロジック（リロード方式に変更してFirebase費用を削減）
(() => {
  const params = new URLSearchParams(location.search);
  const tournamentId = params.get('id');
  let state = null;
  let autoReloadTimer = null;
  const AUTO_RELOAD_INTERVAL = 3 * 60 * 1000; // 3分

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  if (!tournamentId) {
    document.querySelector('main').innerHTML = '<div class="card empty-state">大会IDが指定されていません。</div>';
    return;
  }

  async function reload() {
    const data = await window.FMMStore.loadTournament(tournamentId);
    if (!data) {
      $('#statusBar').innerHTML = '⚠ 大会データが見つかりません';
      return;
    }
    state = data;
    renderAll();
    updateLastUpdated();
  }

  function updateLastUpdated() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const el = $('#lastUpdated');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }

  function setAutoReload(enabled) {
    if (autoReloadTimer) {
      clearInterval(autoReloadTimer);
      autoReloadTimer = null;
    }
    if (enabled) {
      autoReloadTimer = setInterval(reload, AUTO_RELOAD_INTERVAL);
    }
  }

  // イベントハンドラ
  const btnReload = $('#btnReload');
  if (btnReload) btnReload.addEventListener('click', reload);
  const chkAuto = $('#chkAutoReload');
  if (chkAuto) chkAuto.addEventListener('change', (e) => setAutoReload(e.target.checked));

  function renderAll() {
    if (!state) return;
    updateStatusBar();
    renderDashboard();
    renderPisteView();
    renderLiveMatches();
    renderPoolMatchView();
    renderOverallRank();
    renderTeamView();
    renderTournamentView();
    renderFinalResult();
  }

  function computeDashboard() {
    let total = 0, completed = 0;
    (state.pools || []).forEach((p) => {
      total += p.matches.length;
      completed += p.matches.filter((m) => m.completed).length;
    });
    if (state.tournament) {
      state.tournament.rounds.forEach((round) => {
        round.forEach((m) => {
          if (m.fencerA && m.fencerB) {
            total += 1;
            if (m.completed) completed += 1;
          }
        });
      });
    }
    // 団体戦の試合カウント
    if (state.teamMatches) {
      state.teamMatches.forEach((tm) => {
        total += (tm.bouts || []).length;
        completed += (tm.bouts || []).filter(b => b.completed).length;
      });
    }
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const piste = state.pisteCount || 1;
    const remain = total - completed;
    const estimatedRemainMin = Math.ceil((remain * 5) / piste);
    return { total, completed, percent, estimatedRemainMin, remain };
  }

  function renderDashboard() {
    const d = computeDashboard();
    const container = $('#dashboard');
    if (d.total === 0) {
      container.className = 'empty-state';
      container.innerHTML = 'まだ試合が生成されていません';
      return;
    }
    container.className = '';
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center">
        <div><div style="font-size:1.4rem;font-weight:bold">${d.completed}/${d.total}</div><div class="hint">完了試合</div></div>
        <div><div style="font-size:1.4rem;font-weight:bold">${d.percent}%</div><div class="hint">進捗率</div></div>
        <div><div style="font-size:1.4rem;font-weight:bold">${d.remain}</div><div class="hint">残り試合</div></div>
        <div><div style="font-size:1.4rem;font-weight:bold">約${d.estimatedRemainMin}分</div><div class="hint">推定残り時間</div></div>
      </div>
      <div style="background:#e5e7eb;border-radius:4px;height:10px;margin-top:12px;overflow:hidden">
        <div style="background:var(--color-primary);height:100%;width:${d.percent}%;transition:width 0.5s"></div>
      </div>
    `;
  }

  function renderPisteView() {
    const container = $('#pisteView');
    if (!state.pools || state.pools.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = 'プール戦未開始';
      return;
    }
    let pisteCount = state.pisteCount || 0;
    if (pisteCount === 0) {
      state.pools.forEach((p) => { if (p.piste && p.piste > pisteCount) pisteCount = p.piste; });
      if (pisteCount === 0) pisteCount = state.pools.length;
    }
    container.className = '';
    const pistes = {};
    for (let i = 1; i <= pisteCount; i++) pistes[i] = [];
    state.pools.forEach((p) => {
      const piste = p.piste || 1;
      const ongoing = p.matches.find((m) => !m.completed);
      if (ongoing) {
        if (!pistes[piste]) pistes[piste] = [];
        pistes[piste].push({ poolName: p.name, match: ongoing });
      }
    });
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        ${Object.keys(pistes).map((p) => {
          const items = pistes[p];
          if (items.length === 0) {
            return `<div style="border:1px solid var(--color-border);border-radius:6px;padding:10px;background:#fafafa">
              <div style="font-weight:bold;color:var(--color-secondary)">ピスト${p}</div>
              <div class="hint">待機中</div>
            </div>`;
          }
          return items.map((it) => `
            <div style="border:2px solid var(--color-primary);border-radius:6px;padding:10px;background:#fff5f5">
              <div style="font-weight:bold;color:var(--color-primary)">ピスト${p} / ${escapeHtml(it.poolName)}</div>
              <div style="margin-top:6px">${escapeHtml(it.match.fencerAName)} <strong>${it.match.scoreA}</strong></div>
              <div>vs</div>
              <div>${escapeHtml(it.match.fencerBName)} <strong>${it.match.scoreB}</strong></div>
            </div>
          `).join('');
        }).join('')}
      </div>
    `;
  }

  function renderPoolMatchView() {
    const container = $('#poolMatchView');
    if (!state.pools || state.pools.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = 'プール戦未開始';
      return;
    }
    container.className = '';
    container.innerHTML = state.pools.map((p) => {
      const done = p.matches.filter(m => m.completed).length;
      return `
        <div style="margin-bottom:18px">
          <h3 style="font-size:1rem;margin:0 0 6px">${escapeHtml(p.name)} <span class="tag">ピスト${p.piste || '-'}</span> <small style="font-weight:normal;color:#6b7280">${done}/${p.matches.length}試合</small></h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px">
            ${p.matches.map((m, mi) => {
              const status = m.completed ? '✅' : (m.scoreA + m.scoreB > 0 ? '🟢' : '⚪');
              const bg = m.completed ? '#f0fdf4' : (m.scoreA + m.scoreB > 0 ? '#fff5f5' : '#fafafa');
              const aWinByScore = m.completed && m.scoreA > m.scoreB;
              const bWinByScore = m.completed && m.scoreB > m.scoreA;
              const aWinByTie = m.completed && m.scoreA === m.scoreB && m.tieBreakWinner === 'A';
              const bWinByTie = m.completed && m.scoreA === m.scoreB && m.tieBreakWinner === 'B';
              const aWin = (aWinByScore || aWinByTie) ? 'font-weight:bold;color:var(--color-primary)' : '';
              const bWin = (bWinByScore || bWinByTie) ? 'font-weight:bold;color:var(--color-primary)' : '';
              const tieMark = (aWinByTie || bWinByTie) ? ' <span title="延長戦勝者" style="color:#d97706">⏱V</span>' : '';
              return `
                <div style="padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;background:${bg};font-size:0.85rem">
                  <span style="color:#6b7280">${status} ${mi+1}.</span>
                  <span style="${aWin}">${escapeHtml(m.fencerAName)}${aWinByTie ? tieMark : ''}</span>
                  <strong>${m.scoreA}</strong>
                  <span style="color:#6b7280">-</span>
                  <strong>${m.scoreB}</strong>
                  <span style="${bWin}">${escapeHtml(m.fencerBName)}${bWinByTie ? tieMark : ''}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function updateStatusBar() {
    const sb = $('#statusBar');
    const mode = window.FIREBASE_ENABLED ? '🌐 オンライン（リロード式）' : '⚠ オフライン（運営PC内のみ）';
    const typeName = ({
      'individual': '個人戦',
      'team_kohaku': '団体戦・紅白戦',
      'team_relay': '団体戦・イタリアンリレー',
    })[state.type] || '個人戦';
    const fencerCount = (state.fencers || []).length;
    const teamCount = (state.teams || []).length;
    const memberInfo = state.type && state.type.startsWith('team_') ? `${teamCount}チーム` : `参加${fencerCount}名`;
    sb.innerHTML = `${escapeHtml(state.name || '無題の大会')} | ${escapeHtml(state.date)} | ${weaponLabel(state.weapon)} | ${typeName} | ${memberInfo} | ${mode}`;
  }

  function weaponLabel(w) { return ({fleuret:'フルーレ', epee:'エペ', sabre:'サーブル'}[w] || ''); }

  function renderLiveMatches() {
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
    const fromLast = total - 1 - ri;
    const lateNames = ['決勝', '準決勝', '準々決勝', '準々々決勝'];
    if (fromLast < lateNames.length) return lateNames[fromLast];
    return `${ri + 1}回戦`;
  }

  function renderOverallRank() {
    const container = $('#overallRank');
    const isTeam = state.type && state.type.startsWith('team_');
    // 団体戦：チーム順位を表示
    if (isTeam) {
      if (!state.teamPools || state.teamPools.length === 0) {
        container.className = 'empty-state';
        container.innerHTML = '団体プール戦未開始';
        return;
      }
      const allRank = state.teamPools.flatMap(tp => calculateTeamPoolRanking(state.teams || [], tp, state.teamMatches || [], state.type));
      const overall = allRank.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.Ind !== a.Ind) return b.Ind - a.Ind;
        return b.TS - a.TS;
      }).map((s, i) => ({ ...s, rank: i + 1 }));
      container.className = '';
      container.innerHTML = `
        <p class="hint">団体戦 → チーム単位の順位</p>
        <table>
          <thead>
            <tr><th>順位</th><th>チーム名</th>
            <th class="num">勝</th><th class="num">試合</th><th class="num">勝率</th>
            <th class="num">Ind</th><th class="num">得点</th></tr>
          </thead>
          <tbody>
            ${overall.map(s => `
              <tr class="rank-${s.rank}">
                <td>${s.rank}</td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td class="num">${s.V}</td>
                <td class="num">${s.M}</td>
                <td class="num">${(s.winRate * 100).toFixed(0)}%</td>
                <td class="num">${s.Ind > 0 ? '+' + s.Ind : s.Ind}</td>
                <td class="num">${s.TS}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      return;
    }
    // 個人戦
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

  function renderTeamView() {
    const card = $('#teamCard');
    const container = $('#teamView');
    if (!card || !container) return;
    const isTeam = state.type && state.type.startsWith('team_');
    if (!isTeam) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    const matches = state.teamMatches || [];
    if (matches.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = '団体戦未開始';
      return;
    }
    container.className = '';
    const isRelay = state.type === 'team_relay';
    container.innerHTML = matches.map((tm) => {
      const teamA = (state.teams || []).find(t => t.id === tm.teamA);
      const teamB = (state.teams || []).find(t => t.id === tm.teamB);
      const aName = teamA ? teamA.name : '?';
      const bName = teamB ? teamB.name : '?';
      const completed = tm.bouts.filter(b => b.completed).length;
      const totalBouts = tm.bouts.length;
      let aScore, bScore, aWins, bWins;
      if (isRelay) {
        const lastBout = tm.bouts.filter(b => b.completed).pop();
        aScore = lastBout ? lastBout.cumulativeA : 0;
        bScore = lastBout ? lastBout.cumulativeB : 0;
      } else {
        aWins = tm.bouts.filter(b => b.completed && b.winner === 'A').length;
        bWins = tm.bouts.filter(b => b.completed && b.winner === 'B').length;
      }
      const matchDone = tm.completed;
      const winnerName = matchDone ? (tm.winner === 'A' ? aName : bName) : null;
      return `
        <div class="team-card">
          <h3>${escapeHtml(aName)} vs ${escapeHtml(bName)}
            ${matchDone ? `<span class="tag" style="background:var(--color-success)">🏆 ${escapeHtml(winnerName)}</span>` : `<small style="color:#6b7280">${completed}/${totalBouts}試合</small>`}
          </h3>
          <div class="team-score-display">
            <div><div class="name">${escapeHtml(aName)}</div><div class="score">${isRelay ? aScore : aWins}</div></div>
            <div class="vs">vs</div>
            <div><div class="name">${escapeHtml(bName)}</div><div class="score">${isRelay ? bScore : bWins}</div></div>
          </div>
          <table class="team-bout-table">
            <thead>
              <tr><th>#</th><th>対戦</th><th class="num">スコア</th>${isRelay ? '<th class="num">累計</th>' : '<th>勝者</th>'}</tr>
            </thead>
            <tbody>
              ${tm.bouts.map((b, bi) => {
                const playerA = teamA && teamA.members && teamA.members[b.playerAIdx] ? teamA.members[b.playerAIdx] : '?';
                const playerB = teamB && teamB.members && teamB.members[b.playerBIdx] ? teamB.members[b.playerBIdx] : '?';
                const status = b.completed ? '✅' : '⚪';
                const tie = b.tieBreakWinner ? ' ⏱V' : '';
                if (isRelay) {
                  return `<tr>
                    <td>${status} ${bi+1}</td>
                    <td>${escapeHtml(playerA)} vs ${escapeHtml(playerB)}</td>
                    <td class="num">${b.scoreA || 0} - ${b.scoreB || 0}</td>
                    <td class="cumulative">${b.completed ? `${b.cumulativeA} - ${b.cumulativeB}` : '-'}</td>
                  </tr>`;
                } else {
                  const wn = b.winner === 'A' ? aName : (b.winner === 'B' ? bName : '');
                  return `<tr>
                    <td>${status} ${bi+1}</td>
                    <td>${escapeHtml(playerA)} vs ${escapeHtml(playerB)}</td>
                    <td class="num">${b.scoreA || 0} - ${b.scoreB || 0}${tie}</td>
                    <td>${escapeHtml(wn)}</td>
                  </tr>`;
                }
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  }

  function renderTournamentView() {
    const container = $('#tournamentView');
    if (!state.tournament) {
      container.className = 'tournament-bracket empty-state';
      container.innerHTML = 'トーナメント未開始';
      return;
    }
    // SVGで描画
    if (typeof renderBracketSvg === 'function') {
      container.className = 'svg-bracket';
      container.innerHTML = renderBracketSvg(state.tournament, escapeHtml);
      return;
    }
    // フォールバック（従来のテーブル表示）
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
          const aTie = m.tieBreakWinner === 'A' ? ' ⏱V' : '';
          const bTie = m.tieBreakWinner === 'B' ? ' ⏱V' : '';
          return `
            <div class="bracket-match">
              <div class="row ${aWin}"><span>${a}${aTie}</span><span>${m.scoreA || ''}</span></div>
              <div class="row ${bWin}"><span>${b}${bTie}</span><span>${m.scoreB || ''}</span></div>
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
    const t = state.tournament;
    const ranking = [];
    const used = new Set();
    const finalMatch = t.rounds[t.rounds.length - 1][0];
    if (finalMatch.completed) {
      const winner = (state.fencers || state.teams || []).find(f => f.id === finalMatch.winner);
      const loserId = finalMatch.winner === finalMatch.fencerA ? finalMatch.fencerB : finalMatch.fencerA;
      const loser = (state.fencers || state.teams || []).find(f => f.id === loserId);
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
          const f = (state.fencers || state.teams || []).find(x => x.id === lid);
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
  const btnSearch = $('#btnSearch');
  if (btnSearch) {
    btnSearch.addEventListener('click', () => {
      if (!state) return;
      const q = $('#searchName').value.trim().toLowerCase();
      const result = $('#searchResult');
      if (!q) { result.innerHTML = '<p class="hint">名前を入力してください</p>'; return; }
      const list = state.fencers || [];
      const fencer = list.find(f => (f.name || '').toLowerCase().includes(q));
      if (!fencer) { result.innerHTML = '<p class="hint">該当する選手が見つかりません</p>'; return; }
      const remainingPool = [];
      (state.pools || []).forEach((p) => {
        p.matches.forEach((m, idx) => {
          if (!m.completed && (m.fencerA === fencer.id || m.fencerB === fencer.id)) {
            const opponent = m.fencerA === fencer.id ? m.fencerBName : m.fencerAName;
            remainingPool.push(`<li>${escapeHtml(p.name)} 第${idx+1}試合：${escapeHtml(opponent)} と対戦</li>`);
          }
        });
      });
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
  }

  reload();
})();
