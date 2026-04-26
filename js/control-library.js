// ════════════════════════════════════════════════════════════════════════════
//  control-library.js — Bibliothèque de contrôles AuditFlow (v3)
//
//  Ce module ne gère PAS sa propre variable de bibliothèque : il s'appuie sur
//  CONTROLS_LIBRARY (variable globale chargée par graph.js depuis la liste
//  SharePoint AF_ControlsLibrary).
//
//  Fonctions exposées :
//   - openControlLibraryPicker(auditId) : ouvre la modale d'import
//   - importControlsFromCSV(csvText)    : import en masse depuis console
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

function clEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Mapping fréquence biblio (Day/Week/Month/...) → fréquence AuditFlow native
function clMapFrequency(f) {
  if (!f) return 'Ad hoc';
  const v = String(f).toLowerCase();
  if (v === 'month' || v.includes('mensuel')) return 'Mensuel';
  if (v === 'quarter' || v.includes('trimestriel')) return 'Trimestriel';
  if (v === 'year' || v.includes('annuel')) return 'Annuel';
  if (v === 'day' || v === 'week' || v.includes('quotidien') || v.includes('hebdo')) return 'Mensuel';
  return 'Ad hoc';
}

// Extrait la lettre de domaine depuis "E - Support" → "E"
function clDomainLetter(processObj) {
  if (!processObj || !processObj.dom) return '';
  return String(processObj.dom).charAt(0).toUpperCase();
}

// Extrait des mots-clés depuis le nom d'un process audit pour pré-cocher
//   "Finance - OTC"            → ["finance","otc"]
//   "HR - Payroll"             → ["hr","payroll"]
//   "Purchasing & Third Party Mgt" → ["purchasing","third","party","mgt"]
function clProcessKeywords(processName) {
  if (!processName) return [];
  return String(processName)
    .toLowerCase()
    .replace(/[\-&\(\)\/]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// Vrai si un contrôle "matche" le process audit (pour pré-cochage)
//   On regarde domain + lib_name + description du contrôle
function clMatchesProcess(control, keywords) {
  if (!keywords.length) return false;
  const haystack = [
    control.domain || '',
    control.name || '',
    control.description || '',
  ].join(' ').toLowerCase();
  // Match si au moins 1 keyword trouvé
  return keywords.some(k => haystack.includes(k));
}

// ════════════════════════════════════════════════════════════════════════════
//  MODALE D'IMPORT
// ════════════════════════════════════════════════════════════════════════════

function openControlLibraryPicker(auditId) {
  // Vérification que CONTROLS_LIBRARY est chargée
  if (typeof CONTROLS_LIBRARY === 'undefined' || !Array.isArray(CONTROLS_LIBRARY)) {
    if (typeof toast === 'function') toast('Bibliothèque non chargée');
    console.error('[CTRL_LIB] CONTROLS_LIBRARY non disponible');
    return;
  }
  if (CONTROLS_LIBRARY.length === 0) {
    if (typeof toast === 'function') toast('Bibliothèque vide — vérifier la liste SharePoint AF_ControlsLibrary');
    return;
  }

  const ap = (window.AUDIT_PLAN || []).find(a => a.id === auditId);
  if (!ap) {
    if (typeof toast === 'function') toast('Audit introuvable');
    return;
  }

  // Trouver le process de l'audit pour extraire la lettre de domaine
  const processObj = (window.PROCESSES || []).find(p => p.id === ap.processId);
  const auditProcessName = processObj ? processObj.proc : (ap.process || ap.titre || '');
  const auditDomainFull = processObj ? processObj.dom : '';
  const auditDomainLetter = clDomainLetter(processObj);

  // Filtrer CONTROLS_LIBRARY par appliesToDomains contenant cette lettre
  // (on accepte les variations : "F - Finance" matche "F")
  const domainCandidates = auditDomainLetter
    ? CONTROLS_LIBRARY.filter(c => {
        const ad = c.appliesToDomains;
        if (!ad) return false;
        const list = Array.isArray(ad) ? ad : [ad];
        return list.some(d => String(d).trim().charAt(0).toUpperCase() === auditDomainLetter);
      })
    : [];

  // Pré-cochage par mots-clés du nom du process
  const keywords = clProcessKeywords(auditProcessName);
  const preCheckedIds = new Set(
    domainCandidates.filter(c => clMatchesProcess(c, keywords)).map(c => c.id)
  );

  // Banner contextuel
  let banner;
  if (!auditDomainLetter) {
    banner = `<div style="background:#FAEEDA;color:#854F0B;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee">
      <strong>Process audit non identifié.</strong> Tous les contrôles affichés.
    </div>`;
  } else if (domainCandidates.length === 0) {
    banner = `<div style="background:#FAEEDA;color:#854F0B;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee">
      <strong>Aucun contrôle</strong> ne correspond au domaine « ${clEsc(auditDomainFull)} ». Affichage de tous les contrôles.
    </div>`;
  } else {
    banner = `<div style="background:#E1F5EE;color:#085041;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee">
      <strong>${clEsc(auditProcessName)}</strong> · domaine ${clEsc(auditDomainFull)} ·
      ${domainCandidates.length} contrôle(s) candidat(s) · ${preCheckedIds.size} pré-coché(s) sur correspondance « ${clEsc(keywords.join(', '))} »
    </div>`;
  }

  // Sources affichées : si des candidats par domaine existent on les affiche, sinon tout
  const displayed = domainCandidates.length > 0 ? domainCandidates : CONTROLS_LIBRARY.filter(c => !c.archived);

  const overlay = document.createElement('div');
  overlay.id = 'cl-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;max-width:920px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.3)">
      <div style="padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:15px;font-weight:600">Importer depuis la bibliothèque de contrôles</div>
        <button onclick="document.getElementById('cl-modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>
      </div>
      ${banner}
      <div style="padding:10px 16px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid #eee;align-items:center;background:#fafafa">
        <input id="cl-keyword" type="text" placeholder="Filtrer par mot-clé (titre / description)…"
          style="flex:1;min-width:200px;padding:6px 10px;border:0.5px solid #ccc;border-radius:4px;font-size:12px"/>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;cursor:pointer">
          <input id="cl-keyonly" type="checkbox"/> Contrôles clés uniquement
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;cursor:pointer">
          <input id="cl-domainonly" type="checkbox" checked/> Limiter au domaine de l'audit
        </label>
        <button id="cl-select-all" type="button"
          style="padding:5px 10px;border:0.5px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:11px">
          Tout cocher
        </button>
        <button id="cl-select-none" type="button"
          style="padding:5px 10px;border:0.5px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:11px">
          Tout décocher
        </button>
      </div>
      <div id="cl-results" style="flex:1;overflow:auto;padding:0;background:#fff"></div>
      <div style="padding:12px 16px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
        <span id="cl-count" style="font-size:13px;color:#666"></span>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('cl-modal-overlay').remove()"
            style="padding:6px 14px;border:0.5px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px">
            Annuler
          </button>
          <button id="cl-confirm-btn"
            style="padding:6px 14px;border:none;background:#085041;color:#fff;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500">
            Importer la sélection
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Wiring
  const refresh = () => {
    const kwInput = document.getElementById('cl-keyword').value.toLowerCase().trim();
    const keyOnly = document.getElementById('cl-keyonly').checked;
    const domainOnly = document.getElementById('cl-domainonly').checked;

    let pool = domainOnly ? displayed : CONTROLS_LIBRARY.filter(c => !c.archived);
    if (keyOnly) pool = pool.filter(c => c.key === true);
    if (kwInput) {
      pool = pool.filter(c => {
        const hay = ((c.name || '') + ' ' + (c.description || '') + ' ' + (c.domain || '') + ' ' + (c.wcgwTypical || '')).toLowerCase();
        return hay.includes(kwInput);
      });
    }
    clRenderResults(pool, preCheckedIds);
  };

  document.getElementById('cl-keyword').addEventListener('input', refresh);
  document.getElementById('cl-keyonly').addEventListener('change', refresh);
  document.getElementById('cl-domainonly').addEventListener('change', refresh);
  document.getElementById('cl-confirm-btn').addEventListener('click', () => clConfirmImport(auditId));

  document.getElementById('cl-select-all').addEventListener('click', () => {
    document.querySelectorAll('.cl-pick').forEach(cb => cb.checked = true);
  });
  document.getElementById('cl-select-none').addEventListener('click', () => {
    document.querySelectorAll('.cl-pick').forEach(cb => cb.checked = false);
  });

  refresh();
}

// Rendu de la liste des contrôles
function clRenderResults(rows, preCheckedIds) {
  const container = document.getElementById('cl-results');
  if (!container) return;

  // Grouper par domain (= cycle métier)
  const groups = {};
  rows.forEach(r => {
    const k = r.domain || '(sans domaine)';
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  let html = '';
  Object.keys(groups).sort().forEach(domainName => {
    html += `<div style="background:#f5f5f5;padding:6px 14px;font-size:11px;font-weight:600;color:#333;border-top:0.5px solid #ddd;border-bottom:0.5px solid #ddd">
      ${clEsc(domainName)} <span style="color:#999;font-weight:400">(${groups[domainName].length})</span>
    </div>`;
    groups[domainName].forEach(r => {
      const checked = preCheckedIds.has(r.id) ? 'checked' : '';
      const isKey = r.key === true;
      const isAuto = (r.nature || '').toLowerCase().includes('it-dependent');
      html += `
        <label style="display:flex;gap:10px;padding:9px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer;align-items:flex-start"
          onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
          <input type="checkbox" class="cl-pick" data-id="${clEsc(r.id)}" ${checked} style="margin-top:3px"/>
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:baseline">
              <span style="font-family:monospace;font-size:10px;color:#999">${clEsc(r.code || r.id)}</span>
              <span style="font-weight:500;font-size:13px;color:#222">${clEsc(r.name)}</span>
            </div>
            ${r.description ? `<div style="font-size:11px;color:#666;margin-top:2px">${clEsc(r.description)}</div>` : ''}
            <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">
              ${isKey ? '<span style="background:#FAEEDA;color:#854F0B;padding:1px 7px;border-radius:10px;font-size:10px">Clé</span>' : ''}
              ${isAuto ? '<span style="background:#EEEDFE;color:#3C3489;padding:1px 7px;border-radius:10px;font-size:10px">IT-Dep</span>' : '<span style="background:#F1EFE8;color:#444;padding:1px 7px;border-radius:10px;font-size:10px">Manuel</span>'}
              <span style="background:#E6F1FB;color:#0C447C;padding:1px 7px;border-radius:10px;font-size:10px">${clEsc(r.frequency || 'N/A')}</span>
              ${r.framework ? `<span style="background:#F1EFE8;color:#444;padding:1px 7px;border-radius:10px;font-size:10px">${clEsc(r.framework)}</span>` : ''}
            </div>
          </div>
        </label>
      `;
    });
  });

  if (rows.length === 0) {
    html = '<div style="padding:50px;text-align:center;color:#999;font-size:13px">Aucun contrôle ne correspond aux critères</div>';
  }
  container.innerHTML = html;

  const checkedCount = document.querySelectorAll('.cl-pick:checked').length;
  document.getElementById('cl-count').textContent = `${rows.length} affiché(s) · ${checkedCount} sélectionné(s)`;

  // Update count quand on coche/décoche
  document.querySelectorAll('.cl-pick').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = document.querySelectorAll('.cl-pick:checked').length;
      document.getElementById('cl-count').textContent = `${rows.length} affiché(s) · ${n} sélectionné(s)`;
    });
  });
}

// Confirmation d'import : convertit chaque contrôle biblio vers le format AuditFlow
async function clConfirmImport(auditId) {
  const picks = Array.from(document.querySelectorAll('.cl-pick:checked')).map(i => i.dataset.id);
  if (picks.length === 0) {
    if (typeof toast === 'function') toast('Aucun contrôle sélectionné');
    return;
  }

  const ap = window.AUDIT_PLAN.find(a => a.id === auditId);
  const d = window.getAudData ? window.getAudData(auditId) : null;
  if (!ap || !d) {
    if (typeof toast === 'function') toast('Audit introuvable');
    return;
  }

  // L'étape "Tests d'audit" correspond à CS dans audit-detail
  const stepKey = (typeof window.CS !== 'undefined' && window.CS !== null) ? window.CS : 5;
  if (!d.controls) d.controls = {};
  if (!d.controls[stepKey]) d.controls[stepKey] = [];

  let added = 0;
  picks.forEach(libId => {
    const src = CONTROLS_LIBRARY.find(c => c.id === libId);
    if (!src) return;

    // Éviter les doublons : un contrôle déjà importé via libraryRef
    const exists = d.controls[stepKey].some(c => c.libraryRef === src.id);
    if (exists) return;

    // Construire un contrôle au format AuditFlow natif
    d.controls[stepKey].push({
      // Champs natifs (compatibles avec showAddControlModal et le rendu)
      code: src.code || src.id,
      name: src.name || '(sans nom)',
      description: src.description || '',
      owner: src.ownerType || '',
      freq: clMapFrequency(src.frequency),
      clef: src.key === true,
      design: (src.designDefault || 'Existing').toLowerCase(),
      nature: (src.nature || '').toLowerCase().includes('it-dependent') ? 'IT-Dependent' : 'Manual',
      result: null,
      testNature: '',
      finding: '',
      // Champs custom (pour traçabilité, ignorés par le rendu existant)
      libraryRef: src.id,
      libraryFramework: src.framework,
      libraryDomain: src.domain,
      libraryWcgw: src.wcgwTypical,
      libraryTestProcedures: src.testProcedures,
      libraryAppliesToDomains: src.appliesToDomains,
      addedFromLib: true,
      addedAt: new Date().toISOString(),
    });
    added++;
  });

  if (added === 0) {
    if (typeof toast === 'function') toast('Tous les contrôles sélectionnés sont déjà importés');
    return;
  }

  // Sauvegarde
  if (typeof saveAuditData === 'function') {
    await saveAuditData(auditId);
  }
  if (typeof addHist === 'function') {
    addHist(auditId, `${added} contrôle(s) importé(s) depuis la bibliothèque`);
  }

  document.getElementById('cl-modal-overlay').remove();
  if (typeof toast === 'function') toast(`${added} contrôle(s) importé(s) ✓`);

  // Re-rendu
  const detContent = document.getElementById('det-content');
  if (detContent && typeof renderDetContent === 'function') {
    detContent.innerHTML = renderDetContent();
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IMPORT EN MASSE — à exécuter une seule fois pour charger les 133 contrôles
//  Usage console :
//    const csv = await fetch('/auditflow_control_library_axway.csv').then(r => r.text());
//    await importControlsFromCSV(csv);
// ════════════════════════════════════════════════════════════════════════════

async function importControlsFromCSV(csvText) {
  if (typeof createItem !== 'function') {
    console.error('[CTRL_LIB] Fonction createItem non disponible (graph.js)');
    return;
  }

  // Parser CSV (gère les guillemets doublés et les virgules dans les champs)
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else { cur += c; }
    }
    out.push(cur);
    return out;
  };

  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { console.error('[CTRL_LIB] CSV vide'); return; }

  const headers = parseLine(lines[0]);
  console.log(`[CTRL_LIB] Import de ${lines.length - 1} contrôles...`);

  let imported = 0, errors = 0;
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length !== headers.length) {
      console.warn(`[CTRL_LIB] Ligne ${i} ignorée : ${fields.length} colonnes au lieu de ${headers.length}`);
      errors++;
      continue;
    }
    const row = {};
    headers.forEach((h, idx) => row[h] = fields[idx]);

    try {
      await createItem('AF_ControlsLibrary', row);
      imported++;
      if (imported % 10 === 0) console.log(`[CTRL_LIB]   ${imported}/${lines.length - 1}...`);
    } catch (e) {
      console.warn(`[CTRL_LIB] Erreur ${row.code || row.af_id}:`, e.message);
      errors++;
    }
  }

  console.log(`[CTRL_LIB] ✓ Import terminé : ${imported} OK, ${errors} erreurs`);
  console.log('[CTRL_LIB] Recharge la page pour que CONTROLS_LIBRARY se mette à jour.');
}
