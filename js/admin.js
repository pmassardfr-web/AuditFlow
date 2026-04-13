// ─────────────────────────────────────────────────────────────
//  AuditFlow SaaS — admin.js
//  Panneau super-admin : création et gestion des organisations
//
//  Accès : uniquement si CU.role === 'superadmin'
//  Navigation : nav('admin') depuis app.js
//  Vues enregistrées : V['admin'], I['admin']
//
//  Fonctionnalités :
//    - Liste de toutes les organisations
//    - Créer une nouvelle organisation + utilisateur admin
//    - Voir les utilisateurs d'une organisation
//    - Ajouter un utilisateur à une organisation existante
//    - Réinitialiser le wizard d'une organisation
// ─────────────────────────────────────────────────────────────

// ── Vue HTML ─────────────────────────────────────────────────
V['admin'] = function(){
  return `
  <div class="content">

    <!-- En-tête -->
    <div class="sth" style="margin-bottom:1.25rem;">
      <div>
        <div style="font-size:16px; font-weight:600;">Super Admin</div>
        <div style="font-size:12px; color:var(--text-3); margin-top:2px;">
          Gestion des organisations et des utilisateurs
        </div>
      </div>
      <button class="bp" onclick="adminOpenCreateOrg()">
        + Nouvelle organisation
      </button>
    </div>

    <!-- Métriques rapides -->
    <div class="metrics" style="grid-template-columns:repeat(3,1fr); margin-bottom:1.25rem;" id="admin-metrics">
      <div class="mc"><div class="ml">Organisations</div><div class="mv" id="adm-nb-orgs">—</div></div>
      <div class="mc"><div class="ml">Utilisateurs total</div><div class="mv" id="adm-nb-users">—</div></div>
      <div class="mc"><div class="ml">Wizards complétés</div><div class="mv" id="adm-nb-configured">—</div></div>
    </div>

    <!-- Table des organisations -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="sth" style="padding:.875rem 1rem; border-bottom:.5px solid var(--border);">
        <div class="st">Organisations</div>
        <input type="text" class="f-inp" id="adm-search"
          placeholder="Rechercher…" style="width:200px; height:28px; font-size:12px;"
          oninput="adminFilterOrgs(this.value)">
      </div>
      <div class="tw" style="margin:0; border:none;">
        <table>
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Statut wizard</th>
              <th>Utilisateurs</th>
              <th>Créée le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="adm-orgs-tbody">
            <tr><td colspan="5" style="text-align:center; color:var(--text-3); padding:2rem;">
              Chargement…
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>`;
};

// ── Init — chargement des données ─────────────────────────────
I['admin'] = async function(){
  await adminLoadOrgs();
};

// ── Données en mémoire ────────────────────────────────────────
var _adminOrgs  = [];
var _adminUsers = [];

// ── Chargement de toutes les organisations ────────────────────
async function adminLoadOrgs(){
  try {
    // Charger toutes les organisations (superadmin → pas de filtre org)
    var resOrgs = await getSB()
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if(resOrgs.error) throw resOrgs.error;
    _adminOrgs = resOrgs.data || [];

    // Charger tous les utilisateurs
    var resUsers = await getSB()
      .from('af_users')
      .select('*');

    if(resUsers.error) throw resUsers.error;
    _adminUsers = resUsers.data || [];

    // Charger les configs wizard
    var resConfig = await getSB()
      .from('af_org_config')
      .select('organization_id, is_configured, configured_at');

    var configMap = {};
    (resConfig.data || []).forEach(function(c){
      configMap[c.organization_id] = c;
    });

    // Enrichir les orgs avec config + nb users
    _adminOrgs = _adminOrgs.map(function(org){
      var orgUsers = _adminUsers.filter(function(u){ return u.organization_id === org.id; });
      var cfg = configMap[org.id];
      return Object.assign({}, org, {
        nb_users:      orgUsers.length,
        is_configured: cfg ? cfg.is_configured : (org.is_configured || false),
        configured_at: cfg ? cfg.configured_at : org.configured_at,
      });
    });

    // Métriques
    var nbConfigured = _adminOrgs.filter(function(o){ return o.is_configured; }).length;
    document.getElementById('adm-nb-orgs').textContent        = _adminOrgs.length;
    document.getElementById('adm-nb-users').textContent       = _adminUsers.length;
    document.getElementById('adm-nb-configured').textContent  = nbConfigured;

    adminRenderOrgs(_adminOrgs);

  } catch(e){
    console.error('[Admin] Erreur chargement :', e);
    toast('Erreur chargement admin : ' + e.message);
  }
}

// ── Rendu de la table des organisations ───────────────────────
function adminRenderOrgs(orgs){
  var tbody = document.getElementById('adm-orgs-tbody');
  if(!tbody) return;

  if(!orgs.length){
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-3); padding:2rem;">
      Aucune organisation trouvée.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = orgs.map(function(org){
    var statusBadge = org.is_configured
      ? '<span class="badge bdn">Configuré</span>'
      : '<span class="badge bpl">En attente wizard</span>';

    var createdAt = org.created_at
      ? new Date(org.created_at).toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'})
      : '—';

    return `
    <tr id="adm-org-row-${org.id}">
      <td>
        <div style="font-weight:500; font-size:12px;">${_esc(org.name)}</div>
        <div style="font-size:10px; color:var(--text-3); margin-top:1px;">${org.id.slice(0,8)}…</div>
      </td>
      <td>${statusBadge}</td>
      <td>
        <span style="font-weight:500;">${org.nb_users}</span>
        <button class="bs" onclick="adminShowUsers('${org.id}')"
          style="font-size:10px; padding:2px 7px; margin-left:6px;">
          Voir
        </button>
      </td>
      <td style="color:var(--text-2); font-size:11px;">${createdAt}</td>
      <td>
        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          <button class="bs" onclick="adminOpenAddUser('${org.id}', '${_esc(org.name)}')"
            style="font-size:10px; padding:3px 8px;">
            + Utilisateur
          </button>
          ${org.is_configured ? `
          <button class="bs" onclick="adminResetWizard('${org.id}', '${_esc(org.name)}')"
            style="font-size:10px; padding:3px 8px; color:var(--amber);">
            ↺ Wizard
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Filtre recherche ──────────────────────────────────────────
function adminFilterOrgs(query){
  var q = query.toLowerCase().trim();
  if(!q){ adminRenderOrgs(_adminOrgs); return; }
  var filtered = _adminOrgs.filter(function(o){
    return o.name.toLowerCase().includes(q);
  });
  adminRenderOrgs(filtered);
}

// ── Voir les utilisateurs d'une org ──────────────────────────
function adminShowUsers(orgId){
  var org   = _adminOrgs.find(function(o){ return o.id === orgId; });
  var users = _adminUsers.filter(function(u){ return u.organization_id === orgId; });

  var rows = users.length
    ? users.map(function(u){
        return `
        <div style="display:flex; align-items:center; justify-content:space-between;
                    padding:8px 0; border-bottom:.5px solid var(--border); font-size:12px;">
          <div>
            <div style="font-weight:500;">${_esc(u.name)}</div>
            <div style="color:var(--text-3); font-size:11px;">${_esc(u.email)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge ${u.role==='admin'?'br2':'bpl'}">${u.role}</span>
            <span class="badge ${u.status==='actif'?'bdn':'blt'}">${u.status}</span>
            <button class="bd" onclick="adminToggleUserStatus('${u.id}', '${u.status}', '${orgId}')"
              style="font-size:10px; padding:2px 7px;">
              ${u.status === 'actif' ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>
        </div>`;
      }).join('')
    : '<div style="color:var(--text-3); font-size:12px; padding:1rem 0;">Aucun utilisateur.</div>';

  openModal(
    'Utilisateurs — ' + (org ? org.name : orgId),
    `<div style="max-height:360px; overflow-y:auto;">${rows}</div>`,
    async function(){ /* pas d'action sur OK */ }
  );
}

// ── Créer une nouvelle organisation ──────────────────────────
function adminOpenCreateOrg(){
  openModal(
    'Nouvelle organisation',
    `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div>
        <label class="f-lbl">Nom de l'organisation *</label>
        <input id="adm-new-org-name" class="f-inp" style="width:100%;"
          placeholder="ex : Groupe Meridian SA">
      </div>
      <div style="border-top:.5px solid var(--border); padding-top:12px;">
        <div style="font-size:11px; font-weight:600; color:var(--text-2);
                    text-transform:uppercase; letter-spacing:.04em; margin-bottom:10px;">
          Utilisateur administrateur
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div>
            <label class="f-lbl">Nom complet *</label>
            <input id="adm-new-user-name" class="f-inp" style="width:100%;"
              placeholder="ex : Marie Dupont">
          </div>
          <div>
            <label class="f-lbl">Email *</label>
            <input id="adm-new-user-email" class="f-inp" style="width:100%;" type="email"
              placeholder="ex : m.dupont@entreprise.com">
          </div>
          <div>
            <label class="f-lbl">Mot de passe temporaire *</label>
            <input id="adm-new-user-pwd" class="f-inp" style="width:100%;"
              placeholder="Min. 8 car., 1 majuscule, 1 spécial"
              value="${adminGeneratePassword()}">
            <div style="font-size:10px; color:var(--text-3); margin-top:3px;">
              À communiquer au client — il pourra le changer depuis son profil.
            </div>
          </div>
        </div>
      </div>
    </div>
    `,
    adminCreateOrg
  );
}

// ── Générer un mot de passe temporaire sécurisé ───────────────
function adminGeneratePassword(){
  var chars  = 'abcdefghijkmnopqrstuvwxyz';
  var uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var specs  = '!@#$%&*';
  var digits = '23456789';
  var pwd = '';
  pwd += uppers[Math.floor(Math.random() * uppers.length)];
  pwd += specs[Math.floor(Math.random() * specs.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  for(var i = 0; i < 5; i++){
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  // Mélanger
  return pwd.split('').sort(function(){ return Math.random() - 0.5; }).join('');
}

// ── Créer l'organisation + l'utilisateur admin ────────────────
async function adminCreateOrg(){
  var orgName   = (document.getElementById('adm-new-org-name')?.value  || '').trim();
  var userName  = (document.getElementById('adm-new-user-name')?.value  || '').trim();
  var userEmail = (document.getElementById('adm-new-user-email')?.value || '').trim().toLowerCase();
  var userPwd   = (document.getElementById('adm-new-user-pwd')?.value   || '').trim();

  if(!orgName)   { toast('Le nom de l\'organisation est obligatoire.'); return; }
  if(!userName)  { toast('Le nom de l\'utilisateur est obligatoire.');  return; }
  if(!userEmail) { toast('L\'email est obligatoire.');                  return; }
  if(userPwd.length < 8 || !/[A-Z]/.test(userPwd) || !/[^a-zA-Z0-9]/.test(userPwd)){
    toast('Mot de passe trop faible (8 car. min., 1 majuscule, 1 spécial).');
    return;
  }

  try {
    // 1. Créer l'organisation
    var resOrg = await getSB()
      .from('organizations')
      .insert({ name: orgName, is_configured: false })
      .select('id')
      .single();

    if(resOrg.error) throw new Error('Création org : ' + resOrg.error.message);
    var orgId = resOrg.data.id;

    // 2. Créer l'utilisateur admin
    var userId   = 'u_' + Date.now();
    var initials = userName.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);

    var resUser = await getSB()
      .from('af_users')
      .insert({
        id:              userId,
        organization_id: orgId,
        name:            userName,
        email:           userEmail,
        role:            'admin',
        initials:        initials,
        status:          'actif',
        pwd:             userPwd,
      });

    if(resUser.error) throw new Error('Création user : ' + resUser.error.message);

    // 3. Lier dans organization_members
    await getSB()
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id:         userId,
        role:            'owner',
      });

    toast('Organisation "' + orgName + '" créée avec succès !');
    addHist('admin', 'Nouvelle organisation créée : ' + orgName);

    // Recharger la liste
    await adminLoadOrgs();

  } catch(e){
    console.error('[Admin] Erreur création org :', e);
    toast('Erreur : ' + e.message);
  }
}

// ── Ajouter un utilisateur à une organisation existante ───────
function adminOpenAddUser(orgId, orgName){
  openModal(
    'Ajouter un utilisateur — ' + orgName,
    `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div>
        <label class="f-lbl">Nom complet *</label>
        <input id="adm-add-user-name" class="f-inp" style="width:100%;"
          placeholder="ex : Jean Martin">
      </div>
      <div>
        <label class="f-lbl">Email *</label>
        <input id="adm-add-user-email" class="f-inp" style="width:100%;" type="email"
          placeholder="ex : j.martin@entreprise.com">
      </div>
      <div>
        <label class="f-lbl">Rôle</label>
        <select id="adm-add-user-role" class="f-inp" style="width:100%;">
          <option value="admin">Admin</option>
          <option value="auditeur" selected>Auditeur</option>
        </select>
      </div>
      <div>
        <label class="f-lbl">Mot de passe temporaire *</label>
        <input id="adm-add-user-pwd" class="f-inp" style="width:100%;"
          value="${adminGeneratePassword()}">
      </div>
    </div>
    `,
    async function(){
      await adminAddUser(orgId);
    }
  );
}

async function adminAddUser(orgId){
  var userName  = (document.getElementById('adm-add-user-name')?.value  || '').trim();
  var userEmail = (document.getElementById('adm-add-user-email')?.value || '').trim().toLowerCase();
  var userRole  = document.getElementById('adm-add-user-role')?.value  || 'auditeur';
  var userPwd   = (document.getElementById('adm-add-user-pwd')?.value   || '').trim();

  if(!userName || !userEmail || !userPwd){
    toast('Tous les champs sont obligatoires.');
    return;
  }

  try {
    var userId   = 'u_' + Date.now();
    var initials = userName.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);

    var resUser = await getSB()
      .from('af_users')
      .insert({
        id:              userId,
        organization_id: orgId,
        name:            userName,
        email:           userEmail,
        role:            userRole,
        initials:        initials,
        status:          'actif',
        pwd:             userPwd,
      });

    if(resUser.error) throw new Error(resUser.error.message);

    await getSB()
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: userId, role: userRole });

    toast(userName + ' ajouté avec succès !');
    await adminLoadOrgs();

  } catch(e){
    toast('Erreur : ' + e.message);
  }
}

// ── Activer / désactiver un utilisateur ───────────────────────
async function adminToggleUserStatus(userId, currentStatus, orgId){
  var newStatus = currentStatus === 'actif' ? 'inactif' : 'actif';
  try {
    var res = await getSB()
      .from('af_users')
      .update({ status: newStatus })
      .eq('id', userId);

    if(res.error) throw res.error;
    toast('Utilisateur ' + (newStatus === 'actif' ? 'réactivé' : 'désactivé') + '.');
    closeModal();
    await adminLoadOrgs();
    adminShowUsers(orgId);
  } catch(e){
    toast('Erreur : ' + e.message);
  }
}

// ── Réinitialiser le wizard d'une organisation ────────────────
async function adminResetWizard(orgId, orgName){
  if(!confirm('Réinitialiser le wizard de "' + orgName + '" ?\nL\'organisation devra reconfigurer son univers d\'audit.')){
    return;
  }
  try {
    await getSB()
      .from('af_org_config')
      .upsert({ organization_id: orgId, is_configured: false }, { onConflict: 'organization_id' });

    await getSB()
      .from('organizations')
      .update({ is_configured: false, configured_at: null })
      .eq('id', orgId);

    toast('Wizard réinitialisé pour "' + orgName + '".');
    await adminLoadOrgs();
  } catch(e){
    toast('Erreur : ' + e.message);
  }
}

// ── Helper escape HTML ────────────────────────────────────────
function _esc(s){
  if(!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
