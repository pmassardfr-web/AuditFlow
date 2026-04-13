// ─────────────────────────────────────────────────────────────
//  AuditFlow SaaS — wizard.js
//  Questionnaire de configuration intelligent (3 étapes)
//
//  Dépendances (toutes définies dans les autres fichiers du projet) :
//    getSB()   → db.js       — client Supabase
//    CU        → data.js     — utilisateur courant
//    nav()     → app.js      — navigation entre vues
//    toast()   → app.js      — notifications
//    .bp / .bs / .card / .f-inp / .f-lbl / --purple / --border …
//              → css/app.css — styles existants réutilisés tels quels
//
//  Corrections vs version Grok uploadée :
//    ✓ getSB() utilisé (pas supabase direct — cohérent avec db.js)
//    ✓ Listeners sur #wz-root uniquement (pas document) → pas de zombies
//    ✓ Persistance localStorage → brouillon conservé si l'user actualise
//    ✓ Validation avant passage à l'étape suivante
//    ✓ Collecte explicite des valeurs DOM avant navigation
// ─────────────────────────────────────────────────────────────

// ── État du wizard ────────────────────────────────────────────
var wizardAnswers = {
  org_name:            '',
  geo_full_coverage:   null,   // true = totale, false = partielle
  countries_in:        [],
  selected_activities: [],     // 'stocks' | 'magasins' | 'fabrication' | 'transport' | 'achats_int' | 'it'
};
var currentWizardStep = 1;

// ── Point d'entrée — appelé par launchApp() dans app.js ───────
function initWizard(){
  _loadWizardDraft();

  // Pré-remplir le nom depuis CU si dispo et champ vide
  if(CU && CU.name && !wizardAnswers.org_name){
    wizardAnswers.org_name = CU.name;
  }

  var vc = document.getElementById('vc');
  if(!vc){ console.error('[Wizard] #vc introuvable'); return; }

  vc.innerHTML = `
    <div class="content" id="wz-root">

      <div style="max-width:820px; margin:0 auto 1rem;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:.75rem;">
          <div>
            <h2 style="margin:0 0 3px; font-size:17px;">Configuration initiale</h2>
            <p style="margin:0; color:var(--text-2); font-size:12px;">
              Répondez à ces questions pour qu'AuditFlow génère automatiquement votre univers d'audit et votre plan.
            </p>
          </div>
          <button class="bs" id="wz-save-btn" style="font-size:11px; white-space:nowrap; flex-shrink:0;">
            Sauvegarder le brouillon
          </button>
        </div>

        <!-- Barre de progression -->
        <div style="height:3px; background:var(--border); border-radius:2px; overflow:hidden;">
          <div id="wz-progress" style="height:100%; background:var(--purple); transition:width .3s; width:0%"></div>
        </div>
        <div id="wz-step-info" style="font-size:11px; color:var(--text-3); margin-top:3px; text-align:right;"></div>
      </div>

      <!-- Carte principale -->
      <div class="card" style="max-width:820px; margin:0 auto; padding:1.75rem 2rem;">
        <div id="wizard-step-content"></div>

        <!-- Navigation -->
        <div style="margin-top:1.75rem; display:flex; justify-content:space-between; align-items:center;
                    border-top:.5px solid var(--border); padding-top:1.25rem;">
          <button class="bs" id="wz-prev" style="min-width:120px; visibility:hidden;">← Précédent</button>
          <button class="bp" id="wz-next" style="min-width:160px;">Suivant →</button>
        </div>
      </div>

    </div>
  `;

  _attachWizardListeners();
  _renderStep(currentWizardStep);
}

// ── Rendu des étapes ──────────────────────────────────────────
function _renderStep(step){
  var content  = document.getElementById('wizard-step-content');
  var info     = document.getElementById('wz-step-info');
  var progress = document.getElementById('wz-progress');
  var btnPrev  = document.getElementById('wz-prev');
  var btnNext  = document.getElementById('wz-next');
  if(!content) return;

  if(progress) progress.style.width = Math.round(((step-1)/3)*100) + '%';
  if(info)     info.textContent = 'Étape ' + step + ' sur 3';
  if(btnPrev)  btnPrev.style.visibility = step > 1 ? 'visible' : 'hidden';
  if(btnNext){
    btnNext.disabled    = false;
    btnNext.textContent = step < 3 ? 'Suivant →' : '🚀 Générer mon plan d\'audit';
  }

  // ── Étape 1 : Infos générales + couverture géo ─────────────
  if(step === 1){
    content.innerHTML = `
      <div style="margin-bottom:1.25rem;">
        <label class="f-lbl" style="font-size:12px; font-weight:500; margin-bottom:5px;">
          Nom de l'organisation
        </label>
        <input type="text" id="wz-orgname" class="f-inp"
          style="width:100%; font-size:13px;"
          placeholder="ex : Groupe Meridian SA"
          value="${_esc(wizardAnswers.org_name)}">
      </div>

      <div style="margin-bottom:1.25rem;">
        <label class="f-lbl" style="font-size:12px; font-weight:500; display:block; margin-bottom:8px;">
          Couvrez-vous l'ensemble du groupe géographiquement ?
        </label>
        <div style="display:flex; gap:20px;">
          <label style="display:flex; align-items:center; gap:7px; font-size:13px; cursor:pointer;">
            <input type="radio" name="wz-geo" value="true"
              ${wizardAnswers.geo_full_coverage === true ? 'checked' : ''}>
            Oui — couverture totale
          </label>
          <label style="display:flex; align-items:center; gap:7px; font-size:13px; cursor:pointer;">
            <input type="radio" name="wz-geo" value="false"
              ${wizardAnswers.geo_full_coverage === false ? 'checked' : ''}>
            Non — périmètre partiel
          </label>
        </div>
      </div>

      <!-- Bloc conditionnel pays (couverture partielle) -->
      <div id="wz-geo-countries"
        style="display:${wizardAnswers.geo_full_coverage === false ? 'block' : 'none'};
               background:var(--bg); border-radius:var(--radius);
               padding:.875rem 1rem; border-left:3px solid var(--purple);">
        <label class="f-lbl" style="display:block; margin-bottom:7px; font-size:12px; font-weight:500;">
          Pays couverts par l'audit interne
        </label>
        <div style="display:flex; flex-wrap:wrap; gap:5px;" id="wz-countries-tags">
          ${_renderCountryTags()}
        </div>
        <div style="margin-top:7px; display:flex; align-items:center; gap:7px;">
          <input type="text" id="wz-country-add" class="f-inp"
            placeholder="Ajouter un pays + Entrée"
            style="width:200px; font-size:12px; height:28px; padding:0 8px;">
        </div>
      </div>
    `;
  }

  // ── Étape 2 : Activités opérationnelles ────────────────────
  else if(step === 2){
    var acts = [
      { id:'stocks',      label:'Stocks / Entrepôts',                desc:'Gestion physique de stocks' },
      { id:'magasins',    label:'Magasins physiques / Retail',        desc:'Points de vente, caisses' },
      { id:'fabrication', label:'Fabrication / Production',           desc:'Industrie, manufacturing' },
      { id:'transport',   label:'Transport / Logistique',             desc:'Supply chain, livraisons' },
      { id:'achats_int',  label:'Achats internationaux',              desc:'Import-export, douanes' },
      { id:'it',          label:'Systèmes d\'information critiques',  desc:'SI sensibles, cybersécurité' },
    ];
    content.innerHTML = `
      <div style="margin-bottom:.75rem;">
        <span style="font-size:14px; font-weight:600;">Activités opérationnelles</span>
        <p style="margin:3px 0 0; color:var(--text-2); font-size:12px;">
          Cochez tout ce qui s'applique. Chaque sélection active automatiquement les processus d'audit correspondants.
        </p>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:8px;">
        ${acts.map(function(a){
          var on = wizardAnswers.selected_activities.includes(a.id);
          return `
          <label style="display:flex; align-items:flex-start; gap:9px; padding:10px 12px;
                   border:.5px solid ${on ? 'var(--purple)' : 'var(--border-md)'};
                   border-radius:var(--radius); cursor:pointer;
                   background:${on ? 'var(--purple-lt)' : 'var(--white)'};
                   transition:border-color .15s, background .15s;">
            <input type="checkbox" name="wz-act" value="${a.id}" ${on?'checked':''}
              style="margin-top:2px; flex-shrink:0; accent-color:var(--purple);">
            <div>
              <div style="font-size:12px; font-weight:500; color:var(--text);">${a.label}</div>
              <div style="font-size:11px; color:var(--text-3); margin-top:1px;">${a.desc}</div>
            </div>
          </label>`;
        }).join('')}
      </div>
    `;
  }

  // ── Étape 3 : Récapitulatif ────────────────────────────────
  else if(step === 3){
    var score = _computeRiskScore();
    var riskLabel = score >= 9 ? 'Élevé' : score >= 5 ? 'Modéré' : 'Faible';
    var riskColor = score >= 9 ? 'var(--red)' : score >= 5 ? 'var(--amber)' : 'var(--green)';

    var actsLabels = {
      stocks:'Stocks / Entrepôts', magasins:'Magasins / Retail',
      fabrication:'Fabrication / Production', transport:'Transport / Logistique',
      achats_int:'Achats internationaux', it:'SI critiques'
    };
    var actsList = wizardAnswers.selected_activities.length
      ? wizardAnswers.selected_activities.map(function(a){return actsLabels[a]||a;}).join(', ')
      : '<em style="color:var(--text-3)">Aucune sélectionnée</em>';

    var nbProc = _countProcesses();

    content.innerHTML = `
      <div style="font-size:14px; font-weight:600; margin-bottom:1rem;">Récapitulatif</div>

      <div style="background:var(--bg); border-radius:var(--radius-lg); padding:1rem 1.25rem; margin-bottom:1rem;">
        <div style="display:grid; grid-template-columns:160px 1fr; gap:6px 12px; font-size:12px;">
          <div style="color:var(--text-2);">Organisation</div>
          <div style="font-weight:500;">${_esc(wizardAnswers.org_name)||'(non renseigné)'}</div>

          <div style="color:var(--text-2);">Couverture géographique</div>
          <div style="font-weight:500;">${
            wizardAnswers.geo_full_coverage === true  ? 'Totale'
            : wizardAnswers.geo_full_coverage === false
              ? 'Partielle (' + wizardAnswers.countries_in.length + ' pays)'
              : '—'
          }</div>

          <div style="color:var(--text-2);">Activités sélectionnées</div>
          <div style="font-weight:500;">${actsList}</div>

          <div style="color:var(--text-2);">Profil de risque estimé</div>
          <div style="font-weight:600; color:${riskColor};">${riskLabel} (${score} pts)</div>
        </div>
      </div>

      <div style="background:var(--blue-lt); border:.5px solid rgba(55,138,221,.25);
                  border-radius:var(--radius); padding:.875rem 1rem; font-size:12px;">
        <div style="font-weight:600; margin-bottom:4px; color:#0C447C;">Ce qui sera généré automatiquement</div>
        <div style="color:var(--text);">
          <span style="font-size:20px; font-weight:700; color:#0C447C;">${nbProc}</span>
          processus d'audit · plan pluriannuel sur 3 ans · missions planifiées par niveau de risque
        </div>
      </div>

      <div style="margin-top:8px; font-size:11px; color:var(--text-3);">
        Tout sera modifiable librement dans l'application après configuration.
      </div>
    `;
  }
}

// ── Listeners — attachés sur #wz-root uniquement (pas document) ─
function _attachWizardListeners(){
  var root = document.getElementById('wz-root');
  if(!root) return;

  // Suivant / Générer
  root.addEventListener('click', function(e){
    var btn = e.target.closest('#wz-next');
    if(!btn || btn.disabled) return;
    _collectCurrentStep();
    if(currentWizardStep < 3){
      var err = _validateStep(currentWizardStep);
      if(err){ toast(err); return; }
      currentWizardStep++;
      _renderStep(currentWizardStep);
    } else {
      _handleGenerate();
    }
  });

  // Précédent
  root.addEventListener('click', function(e){
    if(!e.target.closest('#wz-prev')) return;
    if(currentWizardStep > 1){
      _collectCurrentStep();
      currentWizardStep--;
      _renderStep(currentWizardStep);
    }
  });

  // Sauvegarder brouillon
  root.addEventListener('click', function(e){
    if(!e.target.closest('#wz-save-btn')) return;
    _collectCurrentStep();
    _saveWizardDraft();
    toast('Brouillon sauvegardé.');
  });

  // Radio géo → affichage conditionnel du bloc pays
  root.addEventListener('change', function(e){
    if(e.target.name !== 'wz-geo') return;
    wizardAnswers.geo_full_coverage = (e.target.value === 'true');
    var bloc = document.getElementById('wz-geo-countries');
    if(bloc) bloc.style.display = wizardAnswers.geo_full_coverage ? 'none' : 'block';
  });

  // Checkboxes activités → feedback visuel immédiat
  root.addEventListener('change', function(e){
    if(e.target.name !== 'wz-act') return;
    var card = e.target.closest('label');
    if(!card) return;
    if(e.target.checked){
      card.style.borderColor = 'var(--purple)';
      card.style.background  = 'var(--purple-lt)';
    } else {
      card.style.borderColor = 'var(--border-md)';
      card.style.background  = 'var(--white)';
    }
  });

  // Ajout d'un pays (Entrée dans le champ texte)
  root.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var inp = e.target.closest('#wz-country-add');
    if(!inp) return;
    e.preventDefault();
    var val = inp.value.trim();
    if(!val) return;
    if(!wizardAnswers.countries_in.includes(val)) wizardAnswers.countries_in.push(val);
    inp.value = '';
    var tags = document.getElementById('wz-countries-tags');
    if(tags) tags.innerHTML = _renderCountryTags();
  });

  // Retirer un pays (clic ×)
  root.addEventListener('click', function(e){
    var rem = e.target.closest('[data-remove-country]');
    if(!rem) return;
    var c = rem.dataset.removeCountry;
    wizardAnswers.countries_in = wizardAnswers.countries_in.filter(function(x){return x!==c;});
    var tags = document.getElementById('wz-countries-tags');
    if(tags) tags.innerHTML = _renderCountryTags();
  });
}

// ── Collecte DOM → wizardAnswers ──────────────────────────────
function _collectCurrentStep(){
  if(currentWizardStep === 1){
    var nameEl = document.getElementById('wz-orgname');
    if(nameEl) wizardAnswers.org_name = nameEl.value.trim();
    var geoEl = document.querySelector('input[name="wz-geo"]:checked');
    if(geoEl) wizardAnswers.geo_full_coverage = (geoEl.value === 'true');
  }
  if(currentWizardStep === 2){
    wizardAnswers.selected_activities = [];
    document.querySelectorAll('input[name="wz-act"]:checked').forEach(function(cb){
      wizardAnswers.selected_activities.push(cb.value);
    });
  }
}

// ── Validation ────────────────────────────────────────────────
function _validateStep(step){
  if(step === 1){
    if(!wizardAnswers.org_name) return 'Veuillez renseigner le nom de l\'organisation.';
    if(wizardAnswers.geo_full_coverage === null) return 'Veuillez indiquer la couverture géographique.';
  }
  return null;
}

// ── Génération finale ─────────────────────────────────────────
async function _handleGenerate(){
  var btn = document.getElementById('wz-next');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Génération en cours…'; }
  try {
    await generateAuditUniverse(wizardAnswers, CU ? CU.organization_id : null);
    _clearWizardDraft();
    currentWizardStep = 1;
    toast('Univers d\'audit généré avec succès !');
    setTimeout(function(){ nav('dashboard'); }, 1200);
  } catch(err){
    console.error('[Wizard]', err);
    toast('Erreur : ' + err.message);
    if(btn){ btn.disabled = false; btn.textContent = '🚀 Générer mon plan d\'audit'; }
  }
}

// ── Calculs ───────────────────────────────────────────────────
function _computeRiskScore(){
  var pts = { stocks:2, magasins:2, fabrication:3, transport:2, achats_int:3, it:3 };
  var score = 0;
  wizardAnswers.selected_activities.forEach(function(a){ score += pts[a]||1; });
  if(wizardAnswers.geo_full_coverage === false) score += 2;
  return score;
}

function _countProcesses(){
  var n = 3; // FIN-001, ACH-001, GOV-001 toujours présents
  if(wizardAnswers.selected_activities.includes('fabrication')) n += 2;
  if(wizardAnswers.selected_activities.includes('stocks') ||
     wizardAnswers.selected_activities.includes('magasins'))    n += 1;
  if(wizardAnswers.selected_activities.includes('magasins'))    n += 1;
  if(wizardAnswers.selected_activities.includes('transport'))   n += 1;
  if(wizardAnswers.selected_activities.includes('achats_int'))  n += 2;
  if(wizardAnswers.selected_activities.includes('it'))          n += 2;
  return n;
}

// ── localStorage ──────────────────────────────────────────────
var _DRAFT_KEY = 'af_wizard_draft';

function _saveWizardDraft(){
  try { localStorage.setItem(_DRAFT_KEY, JSON.stringify({a:wizardAnswers, s:currentWizardStep})); } catch(e){}
}
function _loadWizardDraft(){
  try {
    var raw = localStorage.getItem(_DRAFT_KEY);
    if(!raw) return;
    var d = JSON.parse(raw);
    if(d.a) wizardAnswers      = Object.assign(wizardAnswers, d.a);
    if(d.s > 1) currentWizardStep = d.s;
  } catch(e){}
}
function _clearWizardDraft(){
  try { localStorage.removeItem(_DRAFT_KEY); } catch(e){}
}

// ── Helpers HTML ──────────────────────────────────────────────
function _esc(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _renderCountryTags(){
  if(!wizardAnswers.countries_in.length){
    return '<span style="font-size:11px; color:var(--text-3); font-style:italic;">Tapez un nom ci-dessous puis Entrée</span>';
  }
  return wizardAnswers.countries_in.map(function(c){
    return `<span style="display:inline-flex; align-items:center; gap:3px;
              background:var(--blue-lt); color:#0C447C;
              font-size:11px; padding:2px 8px; border-radius:20px;
              border:.5px solid rgba(55,138,221,.3);">
              ${_esc(c)}
              <button type="button" data-remove-country="${_esc(c)}"
                style="background:none; border:none; cursor:pointer; color:#0C447C;
                       font-size:13px; line-height:1; padding:0 0 0 2px;">&times;</button>
            </span>`;
  }).join('');
}
