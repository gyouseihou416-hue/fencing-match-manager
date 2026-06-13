// tenant.js
// マルチテナント制御：URL?tenant=XXX を元に各利用者の専用ワークスペースを分離する
// - URL → localStorage に保存し、以降はパラメータがなくても自テナントとして動作
// - 全内部リンクに ?tenant=XXX を自動付与
// - ヘッダーの brand-tag を「テナント名 専用」に書き換え、専用バナーを表示
// - store.js から FMSTenant.getId() / getName() を参照する

(function () {
  const TENANT_KEY = 'fmm_current_tenant';
  const TENANT_NAME_PREFIX = 'fmm_tenant_name_';
  const TENANT_LIST_KEY = 'fmm_tenant_list'; // 発行ツール側で管理

  function readTenantFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('tenant');
    } catch (e) { return null; }
  }

  // 起動時、URLパラメータがあれば優先保存
  const urlTid = readTenantFromUrl();
  if (urlTid) {
    try { localStorage.setItem(TENANT_KEY, urlTid); } catch (e) {}
  }

  window.FMSTenant = {
    /** 現在のテナントIDを取得（URL > localStorage） */
    getId() {
      const u = readTenantFromUrl();
      if (u) return u;
      try { return localStorage.getItem(TENANT_KEY) || null; } catch (e) { return null; }
    },

    /** テナント名を取得 */
    getName(tid) {
      const id = tid || this.getId();
      if (!id) return '';
      try { return localStorage.getItem(TENANT_NAME_PREFIX + id) || ''; } catch (e) { return ''; }
    },

    /** テナント名を保存 */
    setName(tid, name) {
      try { localStorage.setItem(TENANT_NAME_PREFIX + tid, name); } catch (e) {}
    },

    /** テナントIDを生成（128bit乱数） */
    generateId() {
      // crypto.randomUUID は最近のブラウザで利用可
      let id;
      try { id = crypto.randomUUID().replace(/-/g, ''); }
      catch (e) {
        // フォールバック：Math.random
        id = '';
        for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
      }
      return 't_' + id.slice(0, 24);
    },

    /** 現在のURL（テナント情報含む）を組み立て */
    buildUrl(page, extraParams) {
      const url = new URL(page, window.location.href);
      const tid = this.getId();
      if (tid) url.searchParams.set('tenant', tid);
      if (extraParams) {
        for (const k of Object.keys(extraParams)) {
          url.searchParams.set(k, extraParams[k]);
        }
      }
      return url.toString();
    },

    /** 専用URL文字列を生成（コピー用） */
    buildShareUrl(tid, page) {
      const base = (page || 'index.html');
      const url = new URL(base, window.location.href);
      url.searchParams.set('tenant', tid);
      return url.toString();
    },

    /** ページ内の内部リンクすべてに ?tenant=XXX を付与 */
    decorateLinks() {
      const tid = this.getId();
      if (!tid) return;
      document.querySelectorAll('a[href]').forEach(a => {
        try {
          const href = a.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
          // 外部リンクは除外
          if (/^https?:\/\//.test(href) && !a.href.startsWith(window.location.origin)) return;
          const u = new URL(a.href);
          if (!u.searchParams.has('tenant')) {
            u.searchParams.set('tenant', tid);
            a.href = u.toString();
          }
        } catch (e) {}
      });
    },

    /** ヘッダーをテナント仕様に更新 */
    updateHeader() {
      const tid = this.getId();
      if (!tid) return;
      const name = this.getName(tid) || 'マイ専用';

      // brand-tag を書き換え
      const tag = document.querySelector('.brand-tag');
      if (tag) tag.textContent = name + ' 専用';

      // テナントバナー（既にあれば重複しない）
      if (document.querySelector('.tenant-banner')) return;
      const header = document.querySelector('header.site-header');
      if (!header) return;
      const banner = document.createElement('div');
      banner.className = 'tenant-banner';
      banner.innerHTML =
        '<span style="margin-right:6px">🔐</span>' +
        '<strong>' + escapeHtml(name) + '</strong> 専用ページ' +
        '<span style="margin-left:auto;font-size:0.75rem;opacity:0.7">ID: ' + escapeHtml(tid.slice(0, 12)) + '…</span>';
      banner.style.cssText =
        'background:linear-gradient(90deg,rgba(212,164,55,0.18),rgba(212,164,55,0.04));' +
        'padding:8px 22px;color:#EBC55B;font-size:0.85rem;' +
        'border-bottom:1px solid rgba(212,164,55,0.35);' +
        'display:flex;align-items:center;gap:8px;font-weight:600;letter-spacing:0.02em';
      header.insertAdjacentElement('afterend', banner);
    },

    /** テナントが未設定の時にウェルカム画面を表示するか判定 */
    requireTenantOrShowWelcome(containerSelector) {
      const tid = this.getId();
      if (tid) return true; // OK、通常動作
      const container = document.querySelector(containerSelector);
      if (!container) return false;
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px 24px">
          <h2 style="border:none;justify-content:center">🔐 専用URLが必要です</h2>
          <p style="margin:18px 0">このシステムは <strong>フェンシング速報</strong> の無料会員向けサービスです。</p>
          <p>ご利用には<strong>専用URL</strong>の発行が必要です。</p>
          <div style="margin:24px 0">
            <a href="https://fencing-speedo.example.com/apply" target="_blank">
              <button>📝 専用URLを申請する</button>
            </a>
          </div>
          <p class="hint">既にURLをお持ちの方は、メールに記載のURLをそのまま開いてください。</p>
        </div>
      `;
      return false;
    },
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // DOMContentLoaded で自動装飾
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.FMSTenant.decorateLinks();
      window.FMSTenant.updateHeader();
    });
  } else {
    window.FMSTenant.decorateLinks();
    window.FMSTenant.updateHeader();
  }
})();
