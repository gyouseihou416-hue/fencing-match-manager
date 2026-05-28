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
      type: 'individual',          // 'individual' | 'team_kohaku' | 'team_relay'
      teamFormat: 'pool_then_ko',  // 'pool_then_ko' | 'ko_only' (団体戦のみ)
      poolScore: 5,
      tourScore: 15,
      pisteCount: 3,
      fencers: [],
      pools: [],
      tournament: null,
      // 団体戦データ
      teams: [],                   // [{id, name, seed, members: [name1, name2, name3], reserve}]
      teamPools: [],               // [{id, name, piste, teamIds, matches: [{teamAId, teamBId, teamMatchId}]}]
      teamMatches: [],             // 各団体戦 [{id, teamA, teamAName, teamB, teamBName, type, bouts, ...}]
      status: 'preparing',
      createdAt: Date.now(),
    };
  }

  function isTeamMode() {
    return state && state.type && state.type.startsWith('team_');
  }

  async function init() {
    if (tournamentId) {
      state = await window.FMMStore.loadTournament(tournamentId);
      if (!state) {
        alert('指定された大会が見つかりません。新規作成画面を開きます。');
        state = emptyTournament();
        tournamentId = state.id;
      }
      // 既存トーナメントのbyeカスケード自動修復（旧バージョン互換）
      if (state.tournament && typeof repairBracketCascade === 'function') {
        try {
          const fixed = repairBracketCascade(state.tournament);
          if (fixed) {
            await window.FMMStore.saveTournament(state);
          }
        } catch (err) {
          console.warn('カスケード修復の保存に失敗（表示は問題なし）:', err);
        }
      }
    } else {
      state = emptyTournament();
      tournamentId = state.id;
      // URLに type が指定されていればプリセット
      const presetType = params.get('type');
      if (presetType && ['individual', 'team_kohaku', 'team_relay'].includes(presetType)) {
        state.type = presetType;
        // 自動的に保存して以降は普通に編集可能に
        await window.FMMStore.saveTournament(state);
      }
      // URLにIDを反映（ページ再読込しても同じ大会に戻れる）
      history.replaceState(null, '', `?id=${encodeURIComponent(tournamentId)}`);
    }
    // 旧データ互換：team系フィールド欠落時は補完
    if (!state.type) state.type = 'individual';
    if (!state.teamFormat) state.teamFormat = 'pool_then_ko';
    if (!state.teams) state.teams = [];
    if (!state.teamPools) state.teamPools = [];
    if (!state.teamMatches) state.teamMatches = [];

    renderAll();
    setupTabs();
    setupBasicTab();
    setupFencersTab();
    setupTeamsTab();
    setupPoolTab();
    setupTournamentTab();
    setupResultTab();
    updateUIByType();
    updateStatusBar();
    updateViewerLink();
  }

  function updateUIByType() {
    const teamOnly = isTeamMode();
    // チーム編成タブの表示／非表示
    document.querySelectorAll('.team-only').forEach(el => {
      el.style.display = teamOnly ? '' : 'none';
    });
    // 参加者タブのラベル変更
    const fencersTab = document.querySelector('[data-tab="fencers"]');
    if (fencersTab) fencersTab.textContent = teamOnly ? '② 選手（参考）' : '② 参加者';
    // 進行方式表示
    const teamFmtWrap = $('#tFormatTeamWrapper');
    if (teamFmtWrap) teamFmtWrap.style.display = teamOnly ? '' : 'none';
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
    const typeName = ({ 'individual':'個人戦', 'team_kohaku':'団体戦・紅白戦', 'team_relay':'団体戦・リレー' })[state.type] || '個人戦';
    const memberInfo = isTeamMode() ? `${(state.teams||[]).length}チーム` : `参加${state.fencers.length}名`;
    sb.innerHTML = `${escapeHtml(state.name || '無題の大会')} | ${escapeHtml(state.date)} | ${typeName} | ${memberInfo}${dashTxt} | ${liveTxt}`;
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
    // 団体戦の9試合カウント
    (state.teamMatches || []).forEach((tm) => {
      total += tm.bouts.length;
      completed += tm.bouts.filter(b => b.completed).length;
    });
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
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
    if ($('#tType')) $('#tType').value = state.type || 'individual';
    if ($('#tTeamFormat')) $('#tTeamFormat').value = state.teamFormat || 'pool_then_ko';

    if ($('#tType')) {
      $('#tType').addEventListener('change', () => {
        const newType = $('#tType').value;
        const hadData = (state.fencers && state.fencers.length) || (state.teams && state.teams.length) || state.tournament;
        if (hadData && state.type !== newType) {
          if (!confirm('大会タイプを変更すると既存データに整合しない可能性があります。続行しますか？')) {
            $('#tType').value = state.type;
            return;
          }
        }
        state.type = newType;
        updateUIByType();
      });
    }

    $('#btnSaveBasic').addEventListener('click', async () => {
      state.name = $('#tName').value.trim();
      state.date = $('#tDate').value;
      state.weapon = $('#tWeapon').value;
      state.category = $('#tCategory').value.trim();
      state.poolScore = Number($('#tPoolScore').value) || 5;
      state.tourScore = Number($('#tTourScore').value) || 15;
      state.pisteCount = Number($('#tPisteCount').value) || 3;
      if ($('#tType')) state.type = $('#tType').value || 'individual';
      if ($('#tTeamFormat')) state.teamFormat = $('#tTeamFormat').value || 'pool_then_ko';
      await save();
      updateUIByType();
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
      const teamName = $('#fTeamName') ? $('#fTeamName').value.trim() : '';
      const fencer = {
        id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        club: $('#fClub').value.trim(),
        seed: Number($('#fSeed').value) || null,
        teamName: isTeamMode() ? teamName : '',
      };
      state.fencers.push(fencer);
      if (isTeamMode() && teamName) syncTeamFromFencer(fencer);
      $('#fName').value = '';
      $('#fClub').value = '';
      if ($('#fTeamName')) $('#fTeamName').value = '';
      $('#fSeed').value = '';
      $('#fName').focus();
      await save();
      renderFencers();
      renderTeams();
    });

    $('#btnBulkImport').addEventListener('click', async () => {
      const text = $('#fBulk').value.trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      lines.forEach((line) => {
        const [name, club, seed, teamName] = line.split(',').map((s) => (s || '').trim());
        if (!name) return;
        const f = {
          id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name, club: club || '', seed: Number(seed) || null,
          teamName: isTeamMode() ? (teamName || '') : '',
        };
        state.fencers.push(f);
        if (isTeamMode() && teamName) syncTeamFromFencer(f);
      });
      $('#fBulk').value = '';
      await save();
      renderFencers();
      renderTeams();
    });
  }

  /**
   * 選手のteamNameを見て、対応するチームに自動登録
   * - チームが存在しない場合は新規作成
   * - 既存チームの空き枠（members[0..2]）に追加、満員なら reserve に
   */
  function syncTeamFromFencer(fencer) {
    if (!fencer.teamName) return;
    let team = state.teams.find(t => t.name === fencer.teamName);
    if (!team) {
      if (state.teams.length >= 32) {
        alert('チームは最大32チームまでです');
        return;
      }
      team = {
        id: 'team_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: fencer.teamName,
        seed: null,
        members: ['', '', ''],
        reserve: '',
        memberFencerIds: ['', '', ''],
        reserveFencerId: '',
      };
      state.teams.push(team);
    }
    // 既存メンバーに含まれているかチェック
    if (!team.memberFencerIds) team.memberFencerIds = ['', '', ''];
    if (team.memberFencerIds.includes(fencer.id) || team.reserveFencerId === fencer.id) return;
    // 空き枠を探す
    for (let i = 0; i < 3; i++) {
      if (!team.memberFencerIds[i]) {
        team.memberFencerIds[i] = fencer.id;
        team.members[i] = fencer.name;
        return;
      }
    }
    // 3枠埋まっていたら reserve へ
    if (!team.reserveFencerId) {
      team.reserveFencerId = fencer.id;
      team.reserve = fencer.name;
    } else {
      alert(`チーム「${team.name}」は4名（リザーブ含む）が埋まっています。${fencer.name} は参加者には登録されましたがチーム未配属です。`);
    }
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
    const teamCol = isTeamMode();
    tbody.innerHTML = sorted.map((f) => `
      <tr>
        <td>${f.seed ?? '-'}</td>
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.club)}</td>
        ${teamCol ? `<td>${escapeHtml(f.teamName || '')}</td>` : ''}
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

  // ---- ②-2 チーム編成 ----
  function setupTeamsTab() {
    renderTeams();
    const btnAdd = $('#btnAddTeam');
    if (!btnAdd) return;
    btnAdd.addEventListener('click', async () => {
      const name = $('#teamName').value.trim();
      if (!name) { alert('チーム名を入力してください'); return; }
      if (state.teams.length >= 32) { alert('チームは最大32チームまでです'); return; }
      state.teams.push({
        id: 'team_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        seed: Number($('#teamSeed').value) || null,
        members: ['', '', ''],
        reserve: '',
      });
      $('#teamName').value = '';
      $('#teamSeed').value = '';
      await save();
      renderTeams();
    });
  }

  function renderTeams() {
    const container = $('#teamsContainer');
    if (!container) return;
    const sorted = [...(state.teams || [])].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    if (sorted.length === 0) {
      container.innerHTML = '<p class="hint">まだチームが登録されていません。「② 参加者」タブで「所属チーム名」を入力して登録すると自動でチーム化されます。</p>';
      return;
    }
    container.innerHTML = sorted.map((t) => {
      const memberCount = (t.memberFencerIds || []).filter(x => x).length;
      const memberStatus = memberCount >= 3 ? '✅ 3名揃い' : (memberCount === 2 ? '⚠ 2名のみ（紅白戦は一部不戦勝、リレー不可）' : '❌ 人数不足');
      const isRelay = state.type === 'team_relay';
      const orderHint = isRelay
        ? '<p class="hint" style="margin:4px 0 6px;color:#d97706">⏱ リレーは走順1→2→3の順番で公式対戦表に従います。走順を変えるには右の番号を1/2/3で入れ替えてください。</p>'
        : '<p class="hint" style="margin:4px 0 6px">公式対戦順（3vs6/1vs5/2vs4…）に従います。順番を変えたい場合は右の走順番号を入れ替えてください。</p>';
      const memberRow = (idx) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:nowrap">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:5px 10px;background:linear-gradient(180deg,rgba(212,164,55,0.18),rgba(212,164,55,0.08));color:#EBC55B;border:1px solid rgba(212,164,55,0.35);border-radius:4px;font-size:0.8rem;font-weight:700;text-align:center;letter-spacing:0.04em;flex-shrink:0">走順${idx + 1}</span>
          <input type="text" class="team-member-input" data-team-id="${t.id}" data-idx="${idx}" value="${escapeHtml(t.members[idx] || '')}" placeholder="選手${idx + 1}の名前" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px">
          <select class="team-member-order" data-team-id="${t.id}" data-idx="${idx}" title="この選手の走順を変更（入れ替え）" style="width:60px;padding:6px 4px;border:1px solid #d1d5db;border-radius:4px;flex-shrink:0">
            <option value="1" ${idx === 0 ? 'selected' : ''}>1</option>
            <option value="2" ${idx === 1 ? 'selected' : ''}>2</option>
            <option value="3" ${idx === 2 ? 'selected' : ''}>3</option>
          </select>
        </div>
      `;
      return `
      <div class="team-card" data-team-id="${t.id}">
        <h3 style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="text" class="team-name-input" data-team-id="${t.id}" value="${escapeHtml(t.name)}" style="font-size:1rem;font-weight:bold;width:200px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px">
          <input type="number" class="team-seed-input" data-team-id="${t.id}" value="${t.seed || ''}" placeholder="シード" style="width:80px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px">
          <span class="tag" style="background:${memberCount >= 3 ? 'var(--color-success)' : 'var(--color-warning)'}">${memberStatus}</span>
          <button class="small secondary" data-team-del="${t.id}">削除</button>
        </h3>
        ${orderHint}
        <div style="display:block">
          ${memberRow(0)}
          ${memberRow(1)}
          ${memberRow(2)}
          <label style="display:block;margin-top:10px;font-size:0.85rem;color:#6b7280">
            リザーブ（控え）
            <input type="text" class="team-reserve-input" data-team-id="${t.id}" value="${escapeHtml(t.reserve || '')}" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px">
          </label>
        </div>
        ${t.substitutionUsed ? `<p class="hint" style="color:var(--color-warning)">⚠ リザーブ使用済み（${escapeHtml(t.members[t.substitutedOut] || '')}が出場中、${escapeHtml(t.reserve || '')}は控え）</p>` : ''}
      </div>
    `;
    }).join('');
    container.querySelectorAll('.team-name-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const t = state.teams.find(x => x.id === inp.dataset.teamId);
        if (t) { t.name = inp.value.trim(); await save(); renderTeams(); }
      });
    });
    container.querySelectorAll('.team-seed-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const t = state.teams.find(x => x.id === inp.dataset.teamId);
        if (t) { t.seed = Number(inp.value) || null; await save(); renderTeams(); }
      });
    });
    container.querySelectorAll('.team-member-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const t = state.teams.find(x => x.id === inp.dataset.teamId);
        if (t) { t.members[Number(inp.dataset.idx)] = inp.value.trim(); await save(); }
      });
    });
    // 走順入れ替え：slot Xに走順Yを入れたら、現在走順Yの選手と入れ替え
    container.querySelectorAll('.team-member-order').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const t = state.teams.find(x => x.id === sel.dataset.teamId);
        if (!t) return;
        const curIdx = Number(sel.dataset.idx);
        const newOrder = Number(e.target.value);
        const targetIdx = newOrder - 1;
        if (curIdx === targetIdx) return;
        // 配列を必ず3スロットの文字列配列に正規化（undefined→''）
        const normalize = (arr) => {
          const out = ['', '', ''];
          for (let i = 0; i < 3; i++) out[i] = arr && arr[i] != null ? String(arr[i]) : '';
          return out;
        };
        t.members = normalize(t.members);
        t.memberFencerIds = normalize(t.memberFencerIds);
        // 入れ替え
        const tmpName = t.members[targetIdx];
        const tmpId = t.memberFencerIds[targetIdx];
        t.members[targetIdx] = t.members[curIdx];
        t.memberFencerIds[targetIdx] = t.memberFencerIds[curIdx];
        t.members[curIdx] = tmpName;
        t.memberFencerIds[curIdx] = tmpId;
        try {
          await save();
        } catch (err) {
          console.error('走順入れ替えの保存に失敗:', err);
          alert('走順の入れ替えに失敗しました。ネットワークを確認してください。');
        }
        renderTeams();
      });
    });
    container.querySelectorAll('.team-reserve-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const t = state.teams.find(x => x.id === inp.dataset.teamId);
        if (t) { t.reserve = inp.value.trim(); await save(); }
      });
    });
    container.querySelectorAll('[data-team-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('このチームを削除しますか？')) return;
        state.teams = state.teams.filter(t => t.id !== btn.dataset.teamDel);
        await save();
        renderTeams();
      });
    });
  }

  // ---- ③ プール戦 ----
  function setupPoolTab() {
    renderPools();
    $('#btnGeneratePool').addEventListener('click', async () => {
      if (isTeamMode()) {
        if (state.teamFormat === 'ko_only') {
          alert('団体戦の進行方式が「いきなりトーナメント」です。プール戦は不要です。');
          return;
        }
        if ((state.teams || []).length < 2) { alert('チームを2チーム以上登録してください'); return; }
        // リレーは全チーム3人以上必要
        if (state.type === 'team_relay') {
          const errors = validateTeamsForRelay(state.teams);
          if (errors.length > 0) {
            alert('イタリアンリレーは3人未満のチームでは実施できません：\n' + errors.join('\n'));
            return;
          }
        }
        if (state.teamPools.length > 0 && !confirm('既存の団体プールを上書きします。よろしいですか？')) return;
        const poolCount = Number($('#poolCount').value) || Math.max(1, Math.ceil(state.teams.length / 4));
        const { pools, teamMatches } = generateTeamPools(state.teams, poolCount, state.type);
        state.teamPools = pools;
        state.teamMatches = teamMatches;
        state.status = 'pool';
        await save();
        renderPools();
        return;
      }
      // 個人戦
      if (state.fencers.length < 3) { alert('参加者を3名以上登録してください'); return; }
      if (state.pools.length > 0 && !confirm('既存のプールを上書きします。よろしいですか？')) return;
      const poolCount = Number($('#poolCount').value) || suggestPoolCount(state.fencers.length);
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
      state.teamPools = [];
      state.teamMatches = state.teamMatches.filter(tm => {
        // 団体戦トーナメントで使われている試合のみ残す
        if (!state.tournament) return false;
        return state.tournament.rounds.some(r => r.some(m => m.teamMatchId === tm.id));
      });
      state.status = 'preparing';
      await save();
      renderPools();
    });
  }

  function renderPools() {
    const container = $('#poolsContainer');
    // 団体戦モード
    if (isTeamMode()) {
      renderTeamPools(container);
      return;
    }
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
              ${pool.matches.map((m, mi) => {
                const isTie = m.completed && m.scoreA === m.scoreB && m.scoreA > 0;
                const tieA = m.tieBreakWinner === 'A';
                const tieB = m.tieBreakWinner === 'B';
                return `
                <div class="match-card ${m.completed ? 'completed' : ''}">
                  <span class="name">${escapeHtml(m.fencerAName)}${tieA ? ' 🏆' : ''}</span>
                  <input type="number" class="score-input" min="0" max="${state.poolScore}" value="${m.scoreA}" data-pool="${pi}" data-match="${mi}" data-side="A">
                  <span class="vs">vs</span>
                  <input type="number" class="score-input" min="0" max="${state.poolScore}" value="${m.scoreB}" data-pool="${pi}" data-match="${mi}" data-side="B">
                  <span class="name">${escapeHtml(m.fencerBName)}${tieB ? ' 🏆' : ''}</span>
                  <button class="small ${m.completed ? 'secondary' : ''}" data-confirm-pool="${pi}" data-confirm-match="${mi}">${m.completed ? '修正' : '確定'}</button>
                  ${isTie ? `
                    <div style="flex-basis:100%;margin-top:6px;padding-top:6px;border-top:1px dashed #d8dbe0;font-size:0.8rem">
                      <span style="color:#d97706;margin-right:8px">⏱ 同点 → 延長戦勝者：</span>
                      <button class="small ${tieA ? '' : 'secondary'}" data-tiebreak-pool="${pi}" data-tiebreak-match="${mi}" data-tiebreak-side="A">${escapeHtml(m.fencerAName)}</button>
                      <button class="small ${tieB ? '' : 'secondary'}" data-tiebreak-pool="${pi}" data-tiebreak-match="${mi}" data-tiebreak-side="B">${escapeHtml(m.fencerBName)}</button>
                      ${(tieA || tieB) ? `<button class="small secondary" data-tiebreak-pool="${pi}" data-tiebreak-match="${mi}" data-tiebreak-side="">クリア</button>` : ''}
                    </div>
                  ` : ''}
                </div>
              `;}).join('')}
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
        // 確定解除した場合は延長戦勝者もリセット
        if (!m.completed) m.tieBreakWinner = null;
        await save();
        renderPools();
        renderOverallRank();
      });
    });
    container.querySelectorAll('[data-tiebreak-pool]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const pi = Number(e.target.dataset.tiebreakPool);
        const mi = Number(e.target.dataset.tiebreakMatch);
        const side = e.target.dataset.tiebreakSide;
        const m = state.pools[pi].matches[mi];
        m.tieBreakWinner = side || null;
        await save();
        renderPools();
        renderOverallRank();
      });
    });
    renderOverallRank();
  }

  function renderTeamPools(container) {
    if (!state.teamPools || state.teamPools.length === 0) {
      container.innerHTML = '<div class="card empty-state">' + (state.teamFormat === 'ko_only' ? '「いきなりトーナメント」方式です。プール戦は不要。' : 'まだ団体プールが生成されていません') + '</div>';
      $('#overallRankTbody').innerHTML = '';
      return;
    }
    container.innerHTML = state.teamPools.map((tp) => {
      const ranking = calculateTeamPoolRanking(state.teams, tp, state.teamMatches, state.type);
      const matchHtml = tp.matches.map((mref, mi) => {
        const tm = state.teamMatches.find(x => x.id === mref.teamMatchId);
        if (!tm) return '';
        return renderTeamMatchCard(tm, `tp-${tp.id}-${mi}`);
      }).join('');
      return `
        <div class="card">
          <h2>${escapeHtml(tp.name)}（${tp.teamIds.length}チーム） <span class="tag">ピスト${tp.piste}</span></h2>
          <div>${matchHtml}</div>
          <div style="margin-top:12px">
            <h3 style="font-size:0.95rem;color:#6b7280">プール順位（団体戦）</h3>
            <table>
              <thead><tr><th>順</th><th>チーム</th><th class="num">V</th><th class="num">M</th><th class="num">V/M</th><th class="num">Ind</th><th class="num">TS</th></tr></thead>
              <tbody>
                ${ranking.map((s, i) => `
                  <tr class="rank-${i+1}">
                    <td>${i+1}</td>
                    <td>${escapeHtml(s.name)}</td>
                    <td class="num">${s.V}</td>
                    <td class="num">${s.M}</td>
                    <td class="num">${(s.winRate*100).toFixed(0)}%</td>
                    <td class="num">${s.Ind > 0 ? '+'+s.Ind : s.Ind}</td>
                    <td class="num">${s.TS}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
    attachTeamMatchEvents();
    // 全体順位
    const allRank = state.teamPools.flatMap(tp => calculateTeamPoolRanking(state.teams, tp, state.teamMatches, state.type));
    const overall = allRank.sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.Ind !== a.Ind) return b.Ind - a.Ind;
      return b.TS - a.TS;
    }).map((s, i) => ({ ...s, rank: i + 1 }));
    const tbody = $('#overallRankTbody');
    if (tbody) {
      tbody.innerHTML = overall.map(s => `
        <tr class="rank-${s.rank}">
          <td>${s.rank}</td>
          <td>${escapeHtml(s.name)}</td>
          <td></td>
          <td class="num">${s.V}</td>
          <td class="num">${s.M}</td>
          <td class="num">${(s.winRate*100).toFixed(1)}%</td>
          <td class="num">${s.TS}</td>
          <td class="num">${s.TR}</td>
          <td class="num">${s.Ind > 0 ? '+'+s.Ind : s.Ind}</td>
        </tr>
      `).join('');
    }
    // 進出チーム数のデフォルト
    if (!state.tournament) {
      const n = state.teams.length;
      const recommended = Math.max(2, Math.min(n, Math.pow(2, Math.floor(Math.log2(n)))));
      const ac = $('#advanceCount');
      if (ac) ac.value = recommended;
    }
  }

  function renderTeamMatchCard(tm, prefix) {
    const teamA = state.teams.find(t => t.id === tm.teamA);
    const teamB = state.teams.find(t => t.id === tm.teamB);
    const isRelay = tm.type === 'team_relay';
    const lastBout = tm.bouts.filter(b => b.completed).pop();
    const cumA = lastBout ? lastBout.cumulativeA : 0;
    const cumB = lastBout ? lastBout.cumulativeB : 0;
    const winsA = tm.bouts.filter(b => b.completed && b.winner === 'A').length;
    const winsB = tm.bouts.filter(b => b.completed && b.winner === 'B').length;
    const dispA = isRelay ? cumA : winsA;
    const dispB = isRelay ? cumB : winsB;
    const targetText = isRelay ? '先に45本' : '先に5勝';
    const aMembers = teamA ? (teamA.memberFencerIds || []).filter(x => x).length : 0;
    const bMembers = teamB ? (teamB.memberFencerIds || []).filter(x => x).length : 0;
    const memberWarn = (aMembers < 3 || bMembers < 3) ? `<p class="hint" style="color:var(--color-warning)">⚠ ${aMembers < 3 ? teamA.name+'は'+aMembers+'人' : ''}${bMembers < 3 ? (aMembers < 3 ? '・' : '')+teamB.name+'は'+bMembers+'人' : ''}（欠員試合は自動5-0）</p>` : '';
    const reserveBtnA = (teamA && teamA.reserveFencerId && !teamA.substitutionUsed) ? `<button class="small warning" data-reserve-match="${tm.id}" data-reserve-side="A">🔄 ${escapeHtml(teamA.name)}のリザーブ投入</button>` : '';
    const reserveBtnB = (teamB && teamB.reserveFencerId && !teamB.substitutionUsed) ? `<button class="small warning" data-reserve-match="${tm.id}" data-reserve-side="B">🔄 ${escapeHtml(teamB.name)}のリザーブ投入</button>` : '';
    return `
      <details class="team-card" ${tm.completed ? '' : 'open'}>
        <summary style="cursor:pointer;font-weight:bold">
          ${escapeHtml(tm.teamAName)} <strong style="color:var(--color-primary)">${dispA}</strong>
          - <strong style="color:var(--color-primary)">${dispB}</strong> ${escapeHtml(tm.teamBName)}
          ${tm.completed ? `<span class="tag" style="background:var(--color-success)">🏆 ${escapeHtml(tm.winner === 'A' ? tm.teamAName : tm.teamBName)}</span>` : `<small style="color:#6b7280">（${targetText}）</small>`}
        </summary>
        ${memberWarn}
        ${(reserveBtnA || reserveBtnB) ? `<div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap">${reserveBtnA}${reserveBtnB}</div>` : ''}
        <table class="team-bout-table" style="margin-top:8px">
          <thead>
            <tr><th>#</th><th>選手A</th><th class="num">スコアA</th><th class="num">スコアB</th><th>選手B</th>${isRelay ? '<th class="num">累計</th>' : '<th>勝者</th>'}<th></th></tr>
          </thead>
          <tbody>
            ${tm.bouts.map((b, bi) => {
              const pa = teamA && teamA.members[b.playerAIdx] || `選手${b.playerAIdx+1}`;
              const pb = teamB && teamB.members[b.playerBIdx] || `選手${b.playerBIdx+1}`;
              const max = isRelay ? (bi+1)*5 : 5;
              const isTie = b.scoreA === b.scoreB && b.scoreA > 0 && !b.forfeit;
              const tieA = b.tieBreakWinner === 'A';
              const tieB = b.tieBreakWinner === 'B';
              const forfeit = b.forfeit;
              const rowBg = forfeit ? 'background:#fef2f2' : (b.completed ? 'background:#f0fdf4' : '');
              return `
                <tr style="${rowBg}">
                  <td>${bi+1}${tieA||tieB?' ⏱':''}${forfeit ? ' 🚫' : ''}</td>
                  <td>${escapeHtml(pa)}${forfeit === 'A' ? ' <span style="color:#ef4444">(欠員)</span>' : ''}${tieA?' 🏆':''}</td>
                  <td class="num"><input type="number" min="0" max="${max}" value="${b.scoreA}" data-tb-match="${tm.id}" data-tb-bout="${bi}" data-tb-side="A" style="width:55px;text-align:right" ${forfeit ? 'disabled' : ''}></td>
                  <td class="num"><input type="number" min="0" max="${max}" value="${b.scoreB}" data-tb-match="${tm.id}" data-tb-bout="${bi}" data-tb-side="B" style="width:55px;text-align:right" ${forfeit ? 'disabled' : ''}></td>
                  <td>${escapeHtml(pb)}${forfeit === 'B' ? ' <span style="color:#ef4444">(欠員)</span>' : ''}${tieB?' 🏆':''}</td>
                  ${isRelay ? `<td class="cumulative">${b.completed ? `${b.cumulativeA} - ${b.cumulativeB}` : '-'}</td>` : `<td>${b.winner === 'A' ? escapeHtml(teamA.name) : (b.winner === 'B' ? escapeHtml(teamB.name) : '-')}${forfeit ? '（不戦勝）' : ''}</td>`}
                  <td>
                    ${forfeit ? '<span class="hint">自動確定</span>' : `<button class="small ${b.completed ? 'secondary' : ''}" data-tb-confirm="${tm.id}" data-tb-bout="${bi}">${b.completed ? '修正' : '確定'}</button>`}
                    ${isTie && !forfeit ? `
                      <div style="margin-top:4px;font-size:0.75rem;padding:6px;background:rgba(212,164,55,0.10);border:1px solid rgba(212,164,55,0.3);border-radius:4px">
                        <div style="color:#EBC55B;font-weight:bold;margin-bottom:4px">⏱ 同点です。延長戦勝者を選んでください：</div>
                        <button class="small ${tieA ? '' : 'secondary'}" data-tb-tie="${tm.id}" data-tb-bout="${bi}" data-tb-side="A">${escapeHtml(teamA.name)}勝ち</button>
                        <button class="small ${tieB ? '' : 'secondary'}" data-tb-tie="${tm.id}" data-tb-bout="${bi}" data-tb-side="B">${escapeHtml(teamB.name)}勝ち</button>
                      </div>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </details>
    `;
  }

  function attachTeamMatchEvents() {
    document.querySelectorAll('[data-tb-match]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const tmId = e.target.dataset.tbMatch;
        const bi = Number(e.target.dataset.tbBout);
        const side = e.target.dataset.tbSide;
        const tm = state.teamMatches.find(x => x.id === tmId);
        if (!tm) return;
        const v = Number(e.target.value) || 0;
        if (side === 'A') tm.bouts[bi].scoreA = v;
        else tm.bouts[bi].scoreB = v;
      });
    });
    document.querySelectorAll('[data-tb-confirm]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tmId = e.target.dataset.tbConfirm;
        const bi = Number(e.target.dataset.tbBout);
        const tm = state.teamMatches.find(x => x.id === tmId);
        if (!tm) return;
        const b = tm.bouts[bi];
        if (b.completed) {
          // 修正 → unconfirm
          b.completed = false;
          b.winner = null;
          b.tieBreakWinner = null;
          recomputeTeamMatch(tm);
        } else {
          // 同点なら案内表示
          if (b.scoreA === b.scoreB && b.scoreA > 0) {
            alert('同点 (' + b.scoreA + '-' + b.scoreB + ') です。下の延長戦ボタンで勝者を選んでください。');
          }
          recordTeamBout(tm, bi, b.scoreA, b.scoreB, null);
        }
        await save();
        renderPools();
        renderTournament();
      });
    });
    document.querySelectorAll('[data-tb-tie]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tmId = e.target.dataset.tbTie;
        const bi = Number(e.target.dataset.tbBout);
        const side = e.target.dataset.tbSide;
        const tm = state.teamMatches.find(x => x.id === tmId);
        if (!tm) return;
        recordTeamBout(tm, bi, tm.bouts[bi].scoreA, tm.bouts[bi].scoreB, side);
        await save();
        renderPools();
        renderTournament();
      });
    });
    // リザーブ投入
    document.querySelectorAll('[data-reserve-match]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tmId = e.target.dataset.reserveMatch;
        const side = e.target.dataset.reserveSide;
        const tm = state.teamMatches.find(x => x.id === tmId);
        if (!tm) return;
        const team = side === 'A' ? state.teams.find(t => t.id === tm.teamA) : state.teams.find(t => t.id === tm.teamB);
        if (!team) return;
        const choice = prompt('交代する選手を選んでください：\n1: ' + (team.members[0]||'-') + '\n2: ' + (team.members[1]||'-') + '\n3: ' + (team.members[2]||'-') + '\n\n番号を入力（1-3）');
        const idx = Number(choice) - 1;
        if (idx < 0 || idx > 2) { alert('1〜3を入力してください'); return; }
        if (!team.members[idx]) { alert('その枠には選手がいません'); return; }
        if (!confirm(team.members[idx] + ' → ' + team.reserve + ' に交代します。交代された選手はこれ以降の試合に出場できません。よろしいですか？')) return;
        const result = substituteReserve(tm, team, side, idx, 0);
        if (!result.ok) { alert(result.reason); return; }
        await save();
        renderTeams();
        renderPools();
        renderTournament();
      });
    });
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
      if (isTeamMode()) {
        await generateTeamTournament();
        return;
      }
      if (state.pools.length === 0) { alert('先にプール戦を実施してください'); return; }
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
      // 団体戦：トーナメント由来の teamMatch を削除
      if (state.tournament && isTeamMode()) {
        const idsInBracket = new Set();
        state.tournament.rounds.forEach(r => r.forEach(m => { if (m.teamMatchId) idsInBracket.add(m.teamMatchId); }));
        state.teamMatches = state.teamMatches.filter(tm => !idsInBracket.has(tm.id));
      }
      state.tournament = null;
      const hasPool = isTeamMode() ? (state.teamPools.length > 0) : (state.pools.length > 0);
      state.status = hasPool ? 'pool' : 'preparing';
      await save();
      renderTournament();
    });
  }

  async function generateTeamTournament() {
    if ((state.teams || []).length < 2) { alert('チームを2チーム以上登録してください'); return; }
    // リレーは全チーム3人以上必要
    if (state.type === 'team_relay') {
      const errors = validateTeamsForRelay(state.teams);
      if (errors.length > 0) {
        alert('イタリアンリレーは3人未満のチームでは実施できません：\n' + errors.join('\n'));
        return;
      }
    }
    let advance;
    if (state.teamFormat === 'ko_only') {
      // シード順にそのまま
      advance = [...state.teams].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    } else {
      if (state.teamPools.length === 0) { alert('先にプール戦を実施してください'); return; }
      const incomplete = state.teamMatches.some(tm => !tm.completed);
      if (incomplete && !confirm('未完了の団体プール試合があります。それでも生成しますか？')) return;
      const allRank = state.teamPools.flatMap(tp => calculateTeamPoolRanking(state.teams, tp, state.teamMatches, state.type));
      const overall = allRank.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.Ind !== a.Ind) return b.Ind - a.Ind;
        return b.TS - a.TS;
      });
      const n = Number($('#advanceCount').value) || overall.length;
      advance = overall.slice(0, n).map(r => state.teams.find(t => t.id === r.id));
    }
    // generateTournament を使う（チームでも構造は同じ）
    state.tournament = generateTournament(advance);
    // 各試合に teamMatchId をひもづける
    state.tournament.rounds.forEach((round, ri) => {
      round.forEach((m, mi) => {
        if (m.fencerA && m.fencerB) {
          const teamA = state.teams.find(t => t.id === m.fencerA);
          const teamB = state.teams.find(t => t.id === m.fencerB);
          if (teamA && teamB) {
            const tm = createTeamMatch(teamA, teamB, state.type);
            state.teamMatches.push(tm);
            m.teamMatchId = tm.id;
          }
        }
      });
    });
    state.status = 'tournament';
    await save();
    renderTournament();
  }

  function renderTournament() {
    const container = $('#tournamentContainer');
    if (!state.tournament) {
      container.className = 'tournament-bracket empty-state';
      container.innerHTML = 'まだ生成されていません';
      return;
    }
    // 個人戦：SVG ブラケット + 編集UI を別カードで表示
    // 団体戦：チーム名表示 + 9試合カードを下に
    const isTeam = isTeamMode();
    container.className = '';

    // SVG ブラケット（renderBracketSvg未定義時はスキップ）
    const svgPart = (typeof renderBracketSvg === 'function') ? `
      <div class="card">
        <h3 style="margin-top:0;font-size:1rem;color:#6b7280">📊 ブラケット俯瞰</h3>
        <div class="svg-bracket">${renderBracketSvg(state.tournament, escapeHtml)}</div>
      </div>
    ` : '<div class="card empty-state hint">⚠ tournament.js が古いバージョンです。最新版をGitHubにアップロードしてください</div>';

    // 各試合の編集UI
    const t = state.tournament;
    const totalRounds = t.rounds.length;
    const roundNames = ['1回戦','2回戦','準々決勝','準決勝','決勝'];
    const editPart = t.rounds.map((round, ri) => {
      const fromLast = totalRounds - 1 - ri;
      const lateNames = ['決勝', '準決勝', '準々決勝', '準々々決勝'];
      const label = fromLast < lateNames.length ? lateNames[fromLast] : `${ri + 1}回戦`;
      return `
        <div class="card">
          <h3 style="margin-top:0;color:var(--color-secondary)">${label}</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">
            ${round.map((m, mi) => isTeam ? renderTeamBracketMatch(m, ri, mi) : renderBracketMatch(m, ri, mi)).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = svgPart + editPart;

    // イベント設定
    if (isTeam) {
      attachTeamMatchEvents();
    } else {
      attachIndividualBracketEvents(container);
    }
  }

  function attachIndividualBracketEvents(container) {
    container.querySelectorAll('[data-tm-confirm]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const ri = Number(e.target.dataset.round);
        const mi = Number(e.target.dataset.match);
        const m = state.tournament.rounds[ri][mi];
        if (!m.fencerA || !m.fencerB) { alert('対戦相手が揃っていません'); return; }
        const sa = Number(container.querySelector(`[data-tm-score-a="${ri}-${mi}"]`).value) || 0;
        const sb = Number(container.querySelector(`[data-tm-score-b="${ri}-${mi}"]`).value) || 0;
        if (sa === sb) {
          alert('同点です。下の延長戦ボタンで勝者を指定してください');
          // 一時保存だけ
          m.scoreA = sa; m.scoreB = sb;
          await save();
          renderTournament();
          renderResult();
          return;
        }
        recordTournamentResult(state.tournament, ri, mi, sa, sb, null);
        if (ri === state.tournament.rounds.length - 1) state.status = 'done';
        await save();
        renderTournament();
        renderResult();
      });
    });
    container.querySelectorAll('[data-tm-tie]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const ri = Number(e.target.dataset.round);
        const mi = Number(e.target.dataset.match);
        const side = e.target.dataset.side;
        const m = state.tournament.rounds[ri][mi];
        const sa = Number(container.querySelector(`[data-tm-score-a="${ri}-${mi}"]`).value) || m.scoreA || 0;
        const sb = Number(container.querySelector(`[data-tm-score-b="${ri}-${mi}"]`).value) || m.scoreB || 0;
        if (sa !== sb) { alert('スコアが同点ではありません'); return; }
        recordTournamentResult(state.tournament, ri, mi, sa, sb, side);
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
    const isTie = m.scoreA === m.scoreB && m.scoreA > 0;
    const tieA = m.tieBreakWinner === 'A';
    const tieB = m.tieBreakWinner === 'B';
    return `
      <div class="bracket-match" style="padding:8px">
        <div class="row ${aClass}">
          <span>${aName}${tieA ? ' 🏆' : ''}</span>
          <input type="number" min="0" style="width:50px" data-tm-score-a="${ri}-${mi}" value="${m.scoreA}" ${m.fencerA ? '' : 'disabled'}>
        </div>
        <div class="row ${bClass}">
          <span>${bName}${tieB ? ' 🏆' : ''}</span>
          <input type="number" min="0" style="width:50px" data-tm-score-b="${ri}-${mi}" value="${m.scoreB}" ${m.fencerB ? '' : 'disabled'}>
        </div>
        ${(m.fencerA && m.fencerB) ? `<button class="small" data-tm-confirm data-round="${ri}" data-match="${mi}">${m.completed ? '修正' : '確定'}</button>` : ''}
        ${isTie ? `
          <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #d8dbe0;font-size:0.8rem">
            <span style="color:#d97706">⏱ 同点 → 延長戦勝者：</span>
            <button class="small ${tieA ? '' : 'secondary'}" data-tm-tie data-round="${ri}" data-match="${mi}" data-side="A">${escapeHtml(m.fencerAName || 'A')}</button>
            <button class="small ${tieB ? '' : 'secondary'}" data-tm-tie data-round="${ri}" data-match="${mi}" data-side="B">${escapeHtml(m.fencerBName || 'B')}</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderTeamBracketMatch(m, ri, mi) {
    if (!m.fencerA && !m.fencerB) {
      return `<div class="bracket-match" style="padding:8px"><div class="row"><span class="bye">未定</span></div></div>`;
    }
    if (!m.teamMatchId) {
      return `
        <div class="bracket-match" style="padding:8px">
          <div class="row">${escapeHtml(m.fencerAName || 'bye')}</div>
          <div class="row">${escapeHtml(m.fencerBName || 'bye')}</div>
          <p class="hint">対戦相手未確定</p>
        </div>
      `;
    }
    const tm = state.teamMatches.find(x => x.id === m.teamMatchId);
    if (!tm) return '<div class="bracket-match">データ不整合</div>';
    // 完了時、tournament.match に勝者を反映
    if (tm.completed && !m.completed) {
      const sa = tm.finalScoreA;
      const sb = tm.finalScoreB;
      const tbW = sa === sb ? (tm.winner === 'A' ? 'A' : (tm.winner === 'B' ? 'B' : null)) : null;
      recordTournamentResult(state.tournament, ri, mi, sa, sb, tbW);
      if (ri === state.tournament.rounds.length - 1) state.status = 'done';
      // 非同期保存
      save();
    } else if (!tm.completed && m.completed) {
      // 巻き戻し：勝者解除（簡略のため放置）
    }
    return renderTeamMatchCard(tm, `tour-${ri}-${mi}`);
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
    const pool = isTeamMode() ? (state.teams || []) : (state.fencers || []);
    const ranking = [];
    const used = new Set();
    const finalMatch = t.rounds[t.rounds.length - 1][0];
    if (finalMatch.completed) {
      const winner = pool.find(f => f.id === finalMatch.winner);
      const loser = pool.find(f => f.id === (finalMatch.winner === finalMatch.fencerA ? finalMatch.fencerB : finalMatch.fencerA));
      if (winner) { ranking.push({ rank: 1, ...winner }); used.add(winner.id); }
      if (loser) { ranking.push({ rank: 2, ...loser }); used.add(loser.id); }
    }
    let nextRank = 3;
    for (let ri = t.rounds.length - 2; ri >= 0; ri--) {
      const round = t.rounds[ri];
      const losers = [];
      round.forEach((m) => {
        if (!m.completed) return;
        const loserId = m.winner === m.fencerA ? m.fencerB : m.fencerA;
        if (loserId && !used.has(loserId)) {
          const f = pool.find(x => x.id === loserId);
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
