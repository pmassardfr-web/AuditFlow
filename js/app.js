// ═══════════════════════════════════════════════════════════
//  app.js — Auth SSO (Entra ID) + fallback login local
// ═══════════════════════════════════════════════════════════

// ── Point d'entrée principal ────────────────────────────────
window.addEventListener('DOMContentLoaded', initLogin);

async function initLogin() {
  // 1. Session locale encore active ?
  var saved = sessionStorage.getItem('af_user');
  if (saved) {
    try {
      CU = JSON.parse(saved);
      await loadAllData();
      launchApp();
      return;
    } catch(e) {
      sessionStorage.removeItem('af_user');
    }
  }

  // 2. Session SSO Azure SWA active ?
  var ssoUser = await checkSSOSession();
  if (ssoUser) {
    CU = ssoUser;
    sessionStorage.setItem('af_user', JSON.stringify(CU));
    await loadAllData();
    launchApp();
    return;
  }

  // 3. Afficher l'écran de login
  showLoginScreen();
}

// ── Vérifier session SSO Azure SWA (/.auth/me) ──────────────
async function checkSSOSession() {
  try {
    var res = await fetch('/.auth/me');
    if (!res.ok) return null;
    var data = await res.json();
    var cp = data && data.clientPrincipal;
    if (!cp || !cp.userDetails) return null;

    var email = cp.userDetails.toLowerCase();
    var displayName = email.split('@')[0].replace('.', ' ');

    // Chercher d'abord dans USERS statiques
    var found = USERS.find(function(u){
      return u.email && u.email.toLowerCase() === email && u.status === 'actif';
    });

    // Si pas trouvé dans statiques, accepter quand même (SharePoint gérera)
    if (!found) {
      found = {
        id: cp.userId,
        name: displayName,
        email: email,
        role: 'auditeur',
        initials: displayName.split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2),
        status: 'actif',
        source: 'sso'
      };
    }

    return {
      id:       found.id || email,
      name:     found.name || displayName,
      email:    email,
      role:     found.role || 'viewer',
      initials: found.initials || displayName.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2),
      status:   'actif',
      source:   'sso',
    };
  } catch(e) {
    return null;
  }
}

// ── Afficher l'écran de login ───────────────────────────────
function showLoginScreen() {
  document.getElementById('ls').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('li-btn').onclick = doLogin;
  document.getElementById('li-pw').onkeydown = function(e){ if(e.key==='Enter') doLogin(); };
  document.getElementById('li-em').onkeydown = function(e){ if(e.key==='Enter') document.getElementById('li-pw').focus(); };
  document.getElementById('li-pw').oninput = validatePwd;
  document.getElementById('li-pw').onfocus = function(){ document.getElementById('pw-rules').style.display='block'; };
}

// ── Message utilisateur non autorisé ───────────────────────
function showUnauthorized(email) {
  document.getElementById('ls').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  var errEl = document.getElementById('li-err');
  errEl.innerHTML = '⛔ Accès refusé pour <strong>' + email + '</strong>.<br>Contactez l\'administrateur AuditFlow.';
  errEl.style.display = 'block';
}

// ── Bouton SSO Microsoft ────────────────────────────────────
function ssoLogin() {
  var base = AUDITFLOW_CONFIG.appUrl;
  window.location.href = base + '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(base + '/');
}

// ── Login fallback email + mot de passe (invités externes) ──
function togglePwd() {
  var inp = document.getElementById('li-pw');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function validatePwd() {
  var v = document.getElementById('li-pw').value;
  var set = function(id, ok){
    var el = document.getElementById(id);
    if (!el) return;
    el.style.color = ok ? 'var(--green)' : 'var(--text-3)';
    el.textContent = (ok ? '✓ ' : '✗ ') + el.textContent.slice(2);
  };
  set('r-len',  v.length >= 8);
  set('r-maj',  /[A-Z]/.test(v));
  set('r-spec', /[^a-zA-Z0-9]/.test(v));
}

async function doLogin() {
  var email  = document.getElementById('li-em').value.trim().toLowerCase();
  var pwd    = document.getElementById('li-pw').value;
  var errEl  = document.getElementById('li-err');

  if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[^a-zA-Z0-9]/.test(pwd)) {
    errEl.textContent = 'Le mot de passe doit contenir 8 caractères min., 1 majuscule et 1 caractère spécial.';
    errEl.style.display = 'block';
    return;
  }

  var user = USERS.find(function(u) {
    return u.email && u.email.toLowerCase() === email
      && (u.pwd === pwd || pwd === AUDITFLOW_CONFIG.demoPassword)
      && u.status === 'actif';
  });

  if (!user) {
    errEl.textContent = 'Email ou mot de passe incorrect, ou accès non autorisé.';
    errEl.style.display = 'block';
    document.getElementById('li-pw').value = '';
    return;
  }

  errEl.style.display = 'none';
  CU = {
    id:       user.id,
    name:     user.name,
    email:    user.email,
    role:     user.role,
    initials: user.initials || '?',
    status:   'actif',
    source:   'local',
  };
  sessionStorage.setItem('af_user', JSON.stringify(CU));
  await loadAllData();
  await launchApp();
}

// ── Lancer l'application après auth ─────────────────────────
async function launchApp() {
  if (!AUDIT_PLAN || AUDIT_PLAN.length === 0) {
    try { await loadAllData(); } catch(e) { console.warn('Data load failed:', e); }
  }

  document.getElementById('ls').style.display  = 'none';
  document.getElementById('app').style.display = 'flex';

  var app = document.getElementById('app');
  app.classList.remove('is-admin', 'is-superadmin');
  if (CU.role === 'admin')  app.classList.add('is-admin');
  if (CU.role === 'viewer') app.classList.add('is-viewer');

  // Avatar
  var initials = CU.initials || CU.name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
  document.getElementById('uav').textContent = initials;
  document.getElementById('uname').textContent = CU.name;
  document.getElementById('urole').textContent =
    CU.role === 'admin'   ? 'Admin / Directeur' :
    CU.role === 'viewer'  ? 'Observateur' : 'Auditeur(rice)';

  // Badge source SSO
  var srcBadge = document.getElementById('sso-badge');
  if (srcBadge) {
    srcBadge.textContent = CU.source === 'sso' ? '🔐 Microsoft' : '🔑 Local';
    srcBadge.style.display = 'block';
  }

  // Nav listeners
  document.querySelectorAll('.nav[data-view]').forEach(function(n){
    n.addEventListener('click', function(){ nav(n.dataset.view); });
  });

  // Déconnexion
  document.getElementById('lbtn').onclick = function() { doLogout(); };

  // Appliquer paramètres org
  if (typeof settingsApplyOnLoad === 'function') {
    await settingsApplyOnLoad();
  }

  // ── Obtenir le token Graph si SSO (popup autorisée car dans flux utilisateur)
  if (CU.source === 'sso') {
    getGraphToken().then(function(token) {
      if (token) {
        console.log('[App] Token Graph prêt ✓');
      } else {
        console.warn('[App] Token Graph non disponible — données non sauvegardées sur SharePoint');
      }
    }).catch(function(e) {
      console.warn('[App] getGraphToken error:', e.message);
    });
  }

  nav('dashboard');
}

// ── Déconnexion ──────────────────────────────────────────────
function doLogout() {
  var wasSSO = CU && CU.source === 'sso';
  CU = null;
  sessionStorage.removeItem('af_user');
  sessionStorage.removeItem('af_graph_token');

  var app = document.getElementById('app');
  app.classList.remove('is-admin', 'is-viewer');

  if (wasSSO) {
    window.location.href = AUDITFLOW_CONFIG.appUrl + '/.auth/logout?post_logout_redirect_uri=' + encodeURIComponent(AUDITFLOW_CONFIG.appUrl + '/');
    return;
  }

  // Login local : reset formulaire
  var em = document.getElementById('li-em');
  var pw = document.getElementById('li-pw');
  if (em) em.value = '';
  if (pw) pw.value = '';
  var errEl = document.getElementById('li-err');
  if (errEl) errEl.style.display = 'none';
  initLogin();
}

// ── Navigation ───────────────────────────────────────────────
function nav(view) {
  CV = view;
  document.querySelectorAll('.nav[data-view]').forEach(function(n){
    n.classList.remove('active');
  });
  var a = document.getElementById('nav-' + view);
  if (a) a.classList.add('active');
  var c = document.getElementById('vc');
  c.innerHTML = '<div class="loading"><div class="sp"></div>Chargement...</div>';
  setTimeout(function() {
    try {
      c.innerHTML = V[view] ? V[view]() : '<div class="content">Vue introuvable.</div>';
      if (I[view]) I[view]();
    } catch(e) {
      c.innerHTML = '<div class="content" style="color:var(--red)">Erreur : ' + e.message + '</div>';
      console.error(e);
    }
  }, 50);
}

// ── Helpers globaux ──────────────────────────────────────────
function openModal(title, body, onOk) {
  document.getElementById('mtitle').textContent = title;
  document.getElementById('mbody').innerHTML = body;
  document.getElementById('modal').classList.add('show');
  document.getElementById('mok').onclick = async function() {
    await onOk();
    closeModal();
  };
}
function closeModal() { document.getElementById('modal').classList.remove('show'); }
function toast(msg) {
  var e = document.getElementById('toast');
  e.textContent = msg;
  e.classList.add('show');
  setTimeout(function(){ e.classList.remove('show'); }, 2500);
}
function addHist(type, msg) {
  var entry = {
    type: type, msg: msg,
    user: CU ? CU.name : '—',
    date: new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'short',year:'numeric'}),
  };
  HISTORY_LOG.unshift(entry);
  addHistoryDB(type, msg, CU ? CU.name : '—').catch(function(e){ console.warn('History error:', e); });
}

function badge(s) {
  var base = s.includes('|') ? s.split('|')[0] : s;
  return '<span class="badge ' + (BMAP[base]||'bpl') + '">' + base + '</span>';
}
function pbar(s) {
  var pct = 0;
  if (typeof s === 'number') pct = s;
  else if (s.includes('|')) { var parts = s.split('|'); pct = Math.min(100, (parseInt(parts[1])+1)*10); }
  else { pct = PRCT[s]||0; }
  return '<div class="pbar"><div class="pfill" style="width:' + pct + '%"></div></div>';
}
function avEl(id, sz) {
  var m = TM[id];
  if (!m) return '';
  return '<div class="avsm" style="' + (AVC[id]||'') + ';width:' + sz + 'px;height:' + sz + 'px;font-size:' + (sz*.4) + 'px">' + m.short + '</div>';
}
