// admin.js - 運営画面のメインロジック
(() => {
  const params = new URLSearchParams(location.search);
  let tournamentId = params.get('id');
  let state = null; // 現在の大会データ

  // ---- ユーティリティ ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function emptyTournament() {
    return {
      id: window.FMMStore.genId(),
      name: '',
      date: new Date().toISOString().slice(0, 10),
      weapon: 'fleuret',
      category: '',
      poolScore: 5,
      tourScore: 15,
      pisteCount: 3,
      fencers: [],
      pools: [], // [{ id, piste, fencers: [...], matches: [...] }]
      tournament: null,
      status: 'preparing',
      createdAt: Date.now(),
    };
  }

  async function init() {
    if (tournamentId) {
      state = await window.FMMStore.loadTournament(tournamentId);
      if (!state) {
        alert('指定された大会が見つかりません。新規作成画面を開きます。');
        state = emptyTournament();
        tournamentId = state.id;
      }
    } else {
      state = emptyTournament();
      tournamentId = state.id;
      // URLにIDを反映（ページ再読込しても同じ大会に戻れる）
      history.replaceState(null, '', `?id=${encodeURIComponent(tournamentId)}`);
    }
    renderAll();
    setupTabs();
    setupBasicTab();
    setupFencersTab();
    setupPoolTab();
    setupTournamentTab();
    setupResultTab();
    updateStatusBar();
    updateViewerLink();
  }

  function setupTabs() {
    $$('.tab-bar button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-bar button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.tab-panel').forEach((p) => (p.style.display = 'none'));
        $(`#tab-${btn.dataset.tab}`).style.display = 'block';
      });
    });
  }

  async function save() {
    await window.FMMStore.saveTournament(state);
    updateStatusBar();
    updateViewerLink();
  }

  function updateStatusBar() {
    const sb = $('#statusBar');
    const liveTxt = window.FIREBASE_ENABLED ? '<span class="live">● LIVE同期中</span>' : '⚠ オフラインモード（Firebase未設定）';
    const dash = computeDashboard();
    const dashTxt = dash.total > 0
      ? ` | 試合進捗 ${dash.completed}/${dash.total} (${dash.percent}%) | 残り推定 ${dash.estimatedRemainMin}分`
      : '';
    sb.innerHTML = `${escapeHtml(state.name || '無題の大会')} | ${escapeHtml(state.date)} | 参加${state.fencers.length}名${dashTxt} | ${liveTxt}`;
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
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    // 1試合平均 5分、ピスト数で並列処理
    const piste = state.pisteCount || 1;
    const remain = total - completed;
    const estimatedRemainMin = Math.ceil((remain * 5) / piste);
    return { total, completed, percent, estimatedRemainMin };
  }

  function updateViewerLink() {
    $('#viewerLink').href = `viewer.html?id=${encodeURIComponent(tournamentId)}`;
    const viewerUrl = `${location.origin}${location.pathname.replace(/admin\.html$/, 'viewer.html')}?id=${encodeURIComponent(tournamentId)}`;
    const urlInput = $('#viewerUrl');
    if (urlInput) urlInput.value = viewerUrl;
    renderQRCode(viewerUrl);
  }

  function renderQRCode(url) {
    const container = $('#qrCodeContainer');
    if (!container || typeof QRCode === 'undefined') return;
    container.innerHTML = '';
    QRCode.toCanvas(url, { width: 200, margin: 2 }, (err, canvas) => {
      if (err) {
        container.innerHTML = '<p class="hint">QRコード生成失敗</p>';
        return;
      }
      container.appendChild(canvas);
    });
  }

  // ---- ① 基本情報 ----
  function setupBasicTab() {
    $('#tName').value = state.name;
    $('#tDate').value = state.date;
    $('#tWeapon').value = state.weapon;
    $('#tCategory').value = state.category;
    $('#tPoolScore').value = state.poolScore;
    $('#tTourScore').value = state.tourScore;
    $('#tPisteCount').value = state.pisteCount || 3;

    $('#btnSaveBasic').addEventListener('click', async () => {
      state.name = $('#tName').value.trim();
      state.date = $('#tDate').value;
      state.weapon = $('#tWeapon').value;
      state.category = $('#tCategory').value.trim();
      state.poolScore = Number($('#tPoolScore').value) || 5;
      state.tourScore = Number($('#tTourScore').value) || 15;
      state.pisteCount = Number($('#tPisteCount').value) || 3;
      await save();
      alert('保存しました');
    });

    $('#btnDelete').addEventListener('click', async () => {
      if (!confirm('この大会を完全に削除します。よろしいですか？')) return;
      await window.FMMStore.deleteTournament(tournamentId);
      location.href = 'index.html';
    });

    // QR / URL / バックアップ
    $('#btnCopyUrl').addEventListener('click', async () => {
      const url = $('#viewerUrl').value;
      try {
        await navigator.clipboard.writeText(url);
        alert('URLをコピーしました');
      } catch (e) {
        $('#viewerUrl').select();
        document.execCommand('copy');
        alert('URLをコピーしました');
      }
    });

    $('#btnExportBackup').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${state.name || 'tournament'}-backup-${state.date}.json`);
    });

    $('#btnImport').addEventListener('click', () => {
      $('#fileImport').click();
    });

    $('#fileImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('現在の大会データを上書きします。よろしいですか？')) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text);
        // IDは現在のものを引き継ぐ
        imported.id = state.id;
        state = imported;
        await save();
        location.reload();
      } catch (err) {
        alert('JSONの読み込みに失敗しました：' + err.message);
      }
    });
  }

  // ---- ② 参加者 ----
  function setupFencersTab() {
    renderFencers();
    $('#btnAddFencer').addEventListener('click', async () => {
      const name = $('#fName').value.trim();
      if (!name) { alert('名前を入力してください'); return; }
      state.fencers.push({
        id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        club: $('#fClub').value.trim(),
        seed: Number($('#fSeed').value) || null,
      });
      $('#fName').value = '';
      $('#fClub').value = '';
      $('#fSeed').value = '';
      $('#fName').focus();
      await save();
      renderFencers();
    });

    $('#btnBulkImport').addEventListener('click', async () => {
      const text = $('#fBulk').value.trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      lines.forEach((line) => {
        const [name, club, seed] = line.split(',').map((s) => (s || '').trim());
        if (!name) return;
        state.fencers.push({
          id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name, club: club || '', seed: Number(seed) || null,
        });
      });
      $('#fBulk').value = '';
      await save();
      renderFencers();
    });
  }

  function renderFencers() {
    const tbody = $('#fencerTbody');
    // シード順 → 未指定は末尾
    const sorted = [...state.fencers].sort((a, b) => {
      if (a.seed == null && b.seed == null) return 0;
      if (a.seed == null) return 1;
      if (b.seed == null) return -1;
      return a.seed - b.seed;
    });
    tbody.innerHTML = sorted.map((f) => `
      <tr>
        <td>${f.seed ?? '-'}</td>
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.club)}</td>
        <td>
          <button class="small secondary" data-del="${f.id}">削除</button>
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('この選手を削除しますか？')) return;
        state.fencers = state.fencers.filter((f) => f.id !== btn.dataset.del);
        await save();
        renderFencers();
      });
    });
    // 推奨プール数を反映
    $('#poolCount').value = suggestPoolCount(state.fencers.length);
  }

  // ---- ③ プール戦 ----
  function setupPoolTab() {
    renderPools();
    $('#btnGeneratePool').addEventListener('click', async () => {
      if (state.fencers.length < 3) { alert('参加者を3名以上登録してください'); return; }
      if (state.pools.length > 0 && !confirm('既存のプールを上書きします。よろしいですか？')) return;
      const poolCount = Number($('#poolCount').value) || suggestPoolCount(state.fencers.length);
      // シード順に並べる
      const sorted = [...state.fencers].sort((a, b) => {
        if (a.seed == null && b.seed == null) return 0;
        if (a.seed == null) return 1;
        if (b.seed == null) return -1;
        return a.seed - b.seed;
      });
      const distributed = distributeFencers(sorted, poolCount);
      const pisteCount = state.pisteCount || poolCount;
      state.pools = distributed.map((poolFencers, i) => {
        const piste = (i % pisteCount) + 1;
        const matches = generatePoolMatches(poolFencers).map((m) => ({ ...m, piste }));
        return {
          id: `pool_${i + 1}`,
          name: `プール${i + 1}`,
          piste,
          fencers: poolFencers,
          matches,
        };
      });
      state.status = 'pool';
      await save();
      renderPools();
    });

    $('#btnResetPool').addEventListener('click', async () => {
      if (!confirm('プール戦をリセットします。スコアもすべて消えます。')) return;
      state.pools = [];
      state.status = 'preparing';
      await save();
      renderPools();
    });
  }

  function renderPools() {
    const container = $('#poolsContainer');
    if (state.pools.length === 0) {
      container.innerHTML = '<div class="card empty-state">まだプールが生成されていません</div>';
      $('#overallRankTbody').innerHTML = '';
      return;
    }
    container.innerHTML = state.pools.map((pool, pi) => {
      const stats = calculatePoolStats(pool.fencers, pool.matches);
      const ranked = sortByRanking(stats);
      const pisteLabel = pool.piste ? `<span class="tag">ピスト${pool.piste}</span>` : '';
      const doneCount = pool.matches.filter(m => m.completed).length;
      return `
        <div class="card">
          <h2>${escapeHtml(pool.name)}（${pool.fencers.length}名）${pisteLabel} <small style="font-weight:normal;color:#6b7280;font-size:0.85rem;">${doneCount}/${pool.matches.length}試合完了</small></h2>
          <div class="grid-2col">
            <div>
              <h3 style="font-size:0.95rem;color:#6b7280">対戦カード</h3>
              ${pool.matches.map((m, mi) => `
                <div class="match-card ${m.completed ? 'completed' : ''}">
                  <span class="name">${escapeHtml(m.fencerAName)}</span>
                  <input type="number" class="score-input" min="0" max="${state.poolScore}" value="${m.scoreA}" data-pool="${pi}" data-match="${mi}" data-side="A">
                  <span class="vs">vs</span>
                  <input type="number" class="score-input" min="0" max="${state.poolScore}" value="${m.scoreB}" data-pool="${pi}" data-match="${mi}" data-side="B">
                  <span class="name">${escapeHtml(m.fencerBName)}</span>
                  <button class="small ${m.completed ? 'secondary' : ''}" data-confirm-pool="${pi}" data-confirm-match="${mi}">${m.completed ? '修正' : '確定'}</button>
                </div>
              `).join('')}
            </div>
            <div>
              <h3 style="font-size:0.95rem;color:#6b7280">プール順位</h3>
              <table>
                <thead><tr><th>順</th><th>名前</th><th class="num">V</th><th class="num">Ind</th><th class="num">TS</th></tr></thead>
                <tbody>
                  ${ranked.map((s, i) => `
                    <tr class="rank-${i+1}">
                      <td>${i+1}</td>
                      <td>${escapeHtml(s.name)}</td>
                      <td class="num">${s.V}</td>
                      <td class="num">${s.Ind > 0 ? '+' + s.Ind : s.Ind}</td>
                      <td class="num">${s.TS}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // スコア入力イベント
    container.querySelectorAll('.score-input').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const pi = Number(e.target.dataset.pool);
        const mi = Number(e.target.dataset.match);
        const side = e.target.dataset.side;
        state.pools[pi].matches[mi][side === 'A' ? 'scoreA' : 'scoreB'] = Number(e.target.value) || 0;
      });
    });
    container.querySelectorAll('[data-confirm-pool]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const pi = Number(e.target.dataset.confirmPool);
        const mi = Number(e.target.dataset.confirmMatch);
        const m = state.pools[pi].matches[mi];
        m.completed = !m.completed;
        await save();
        renderPools();
        renderOverallRank();
      });
    });
    renderOverallRank();
  }

  function renderOverallRank() {
    if (state.pools.length === 0) return;
    const allStats = state.pools.map((p) => calculatePoolStats(p.fencers, p.matches));
    const overall = calculateOverallRanking(allStats);
    const tbody = $('#overallRankTbody');
    tbody.innerHTML = overall.map((s) => `
      <tr class="rank-${s.rank}">
        <td>${s.rank}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.club)}</td>
        <td class="num">${s.V}</td>
        <td class="num">${s.M}</td>
        <td class="num">${(s.winRate * 100).toFixed(1)}%</td>
        <td class="num">${s.TS}</td>
        <td class="num">${s.TR}</td>
        <td class="num">${s.Ind > 0 ? '+' + s.Ind : s.Ind}</td>
      </tr>
    `).join('');
    // 進出人数のデフォルト = bracket sizeに収まる人数
    if (!state.tournament) {
      const n = state.fencers.length;
      const recommended = Math.max(2, Math.min(n, Math.pow(2, Math.floor(Math.log2(n)))));
      $('#advanceCount').value = recommended;
    }
  }

  // ---- ④ トーナメント ----
  function setupTournamentTab() {
    renderTournament();
    $('#btnGenerateTournament').addEventListener('click', async () => {
      if (state.pools.length === 0) { alert('先にプール戦を実施してください'); return; }
      // すべてのプール戦が完了しているかチェック
      const incomplete = state.pools.some(p => p.matches.some(m => !m.completed));
      if (incomplete && !confirm('まだ完了していないプール試合があります。それでも生成しますか？')) return;
      const n = Number($('#advanceCount').value) || state.fencers.length;
      const allStats = state.pools.map(p => calculatePoolStats(p.fencers, p.matches));
      const overall = calculateOverallRanking(allStats);
      const advance = overall.slice(0, n);
      state.tournament = generateTournament(advance);
      state.status = 'tournament';
      await save();
      renderTournament();
    });

    $('#btnResetTournament').addEventListener('click', async () => {
      if (!confirm('トーナメントをリセットします。')) return;
      state.tournament = null;
      state.status = state.pools.length ? 'pool' : 'preparing';
      await save();
      renderTournament();
    });
  }

  function renderTournament() {
    const container = $('#tournamentContainer');
    if (!state.tournament) {
      container.className = 'tournament-bracket empty-state';
      container.innerHTML = 'まだ生成されていません';
      return;
    }
    container.className = 'tournament-bracket';
    const roundNames = ['1回戦','2回戦','準々決勝','準決勝','決勝'];
    const t = state.tournament;
    const totalRounds = t.rounds.length;
    container.innerHTML = t.rounds.map((round, ri) => {
      const labelIdx = totalRounds - 1 - ri;
      // 最後がround0=決勝になるように
      const label = roundNames[totalRounds - 1 - ri] || `第${ri+1}ラウンド`;
      return `
        <div class="tournament-round">
          <h3 style="font-size:0.9rem;color:#6b7280;margin:4px 0">${label}</h3>
          ${round.map((m, mi) => renderBracketMatch(m, ri, mi)).join('')}
        </div>
      `;
    }).join('');

    // 入力イベント
    container.querySelectorAll('[data-tm-confirm]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const ri = Number(e.target.dataset.round);
        const mi = Number(e.target.dataset.match);
        const m = state.tournament.rounds[ri][mi];
        if (!m.fencerA || !m.fencerB) { alert('対戦相手が揃っていません'); return; }
        const sa = Number(container.querySelector(`[data-tm-score-a="${ri}-${mi}"]`).value) || 0;
        const sb = Number(container.querySelector(`[data-tm-score-b="${ri}-${mi}"]`).value) || 0;
        if (sa === sb) { alert('引き分けは認められません'); return; }
        recordTournamentResult(state.tournament, ri, mi, sa, sb);
        // 決勝なら終了ステータス
        if (ri === state.tournament.rounds.length - 1) state.status = 'done';
        await save();
        renderTournament();
        renderResult();
      });
    });
  }

  function renderBracketMatch(m, ri, mi) {
    const aName = m.fencerAName || '<span class="bye">bye</span>';
    const bName = m.fencerBName || '<span class="bye">bye</span>';
    const aClass = m.completed && m.winner === m.fencerA ? 'winner' : '';
    const bClass = m.completed && m.winner === m.fencerB ? 'winner' : '';
    return `
      <div class="bracket-match">
        <div class="row ${aClass}">
          <span>${aName}</span>
          <input type="number" min="0" style="width:50px" data-tm-score-a="${ri}-${mi}" value="${m.scoreA}" ${m.fencerA ? '' : 'disabled'}>
        </div>
        <div class="row ${bClass}">
          <span>${bName}</span>
          <input type="number" min="0" style="width:50px" data-tm-score-b="${ri}-${mi}" value="${m.scoreB}" ${m.fencerB ? '' : 'disabled'}>
        </div>
        ${(m.fencerA && m.fencerB) ? `<button class="small" data-tm-confirm data-round="${ri}" data-match="${mi}">${m.completed ? '修正' : '確定'}</button>` : ''}
      </div>
    `;
  }

  // ---- ⑤ 結果 ----
  function setupResultTab() {
    renderResult();
    $('#btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${state.name || 'tournament'}.json`);
    });
    $('#btnExportCsv').addEventListener('click', () => {
      const rows = [['順位', '名前', '所属']];
      const final = computeFinalRanking();
      final.forEach((f) => rows.push([f.rank, f.name, f.club || '']));
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
      downloadBlob(blob, `${state.name || 'tournament'}-result.csv`);
    });
  }

  function computeFinalRanking() {
    if (!state.tournament) return [];
    const t = state.tournament;
    const ranking = [];
    const used = new Set();
    // 決勝
    const finalMatch = t.rounds[t.rounds.length - 1][0];
    if (finalMatch.completed) {
      const winner = state.fencers.find(f => f.id === finalMatch.winner);
      const loser = state.fencers.find(f => f.id === (finalMatch.winner === finalMatch.fencerA ? finalMatch.fencerB : finalMatch.fencerA));
      if (winner) { ranking.push({ rank: 1, ...winner }); used.add(winner.id); }
      if (loser) { ranking.push({ rank: 2, ...loser }); used.add(loser.id); }
    }
    // 各ラウンドの敗者
    let nextRank = 3;
    for (let ri = t.rounds.length - 2; ri >= 0; ri--) {
      const round = t.rounds[ri];
      const losers = [];
      round.forEach((m) => {
        if (!m.completed) return;
        const loserId = m.winner === m.fencerA ? m.fencerB : m.fencerA;
        if (loserId && !used.has(loserId)) {
          const f = state.fencers.find(x => x.id === loserId);
          if (f) { losers.push(f); used.add(f.id); }
        }
      });
      losers.forEach(f => ranking.push({ rank: nextRank, ...f }));
      nextRank += losers.length;
    }
    return ranking;
  }

  function renderResult() {
    const ranking = computeFinalRanking();
    const container = $('#finalResult');
    if (ranking.length === 0) {
      container.className = 'empty-state';
      container.innerHTML = 'トーナメント未完了';
      return;
    }
    container.className = '';
    container.innerHTML = `
      <table>
        <thead><tr><th>順位</th><th>名前</th><th>所属</th></tr></thead>
        <tbody>
          ${ranking.map(r => `
            <tr class="rank-${r.rank}">
              <td>${r.rank}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.club || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderAll() {
    // 初期描画は各セットアップ関数内で行われるためここでは何もしない
  }

  init();
})();
