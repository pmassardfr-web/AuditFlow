// ─────────────────────────────────────────────────────────────
//  AuditFlow SaaS — audit-gen.js
//  Génère automatiquement les processus et le plan d'audit
//  à partir des réponses du wizard.
//
//  Dépendances :
//    getSB()  → db.js   — client Supabase (votre fonction existante)
//    CU       → data.js — utilisateur courant
//
//  Tables utilisées :
//    af_processes   — univers d'audit (colonnes vérifiées dans migration.sql)
//    af_audit_plan  — plan d'audit (colonnes : titre, annee, type, statut,
//                     domaine, organization_id, is_generated, notes)
//    af_org_config  — config wizard (créée par migration-saas.sql)
//    organizations  — champ is_configured ajouté par migration-saas.sql
//
//  Corrections vs version Grok uploadée :
//    ✓ getSB() à la place de supabase direct
//    ✓ Colonnes af_audit_plan conformes au schéma réel du projet 74SW
//      (titre, annee, type, statut, domaine — pas label/status/year)
//    ✓ Missions insérées dans af_audit_plan avec le bon schéma,
//      pas dans une table af_audit_missions inexistante
//    ✓ generateAuditUniverse() throws en cas d'erreur (géré par wizard.js)
//      au lieu d'appeler toast() en double
// ─────────────────────────────────────────────────────────────

// ── Point d'entrée public ─────────────────────────────────────
async function generateAuditUniverse(answers, organization_id){
  if(!organization_id){
    throw new Error('organization_id manquant — impossible de générer l\'univers d\'audit.');
  }
  console.log('[AuditGen] Démarrage pour org :', organization_id);

  // 1. Sauvegarder les réponses brutes dans af_org_config
  await _saveWizardAnswers(answers, organization_id);

  // 2. Créer les processus dans af_processes
  var processes = await _activateProcesses(answers, organization_id);

  // 3. Créer le plan d'audit dans af_audit_plan
  var planId = await _createAuditPlan(answers, organization_id);

  // 4. Créer les missions (entrées liées au plan) dans af_audit_plan
  await _createMissions(processes, planId, organization_id);

  // 5. Marquer l'organisation comme configurée
  await _markOrgAsConfigured(organization_id);

  console.log('[AuditGen] ✅ Terminé — ' + processes.length + ' processus créés.');
}

// ── 1. Sauvegarde des réponses (af_org_config) ────────────────
async function _saveWizardAnswers(answers, organization_id){
  var payload = {
    organization_id:     organization_id,
    is_configured:       false,                    // mis à true à l'étape 5
    wizard_answers:      answers,                  // JSONB complet
    geo_full_coverage:   answers.geo_full_coverage,
    countries_in:        answers.countries_in      || [],
    selected_activities: answers.selected_activities || [],
    configured_at:       new Date().toISOString(),
  };
  var res = await getSB()
    .from('af_org_config')
    .upsert(payload, { onConflict: 'organization_id' });

  if(res.error){
    // Non bloquant — la table sera créée par migration-saas.sql
    console.warn('[AuditGen] af_org_config upsert :', res.error.message);
  }
}

// ── 2. Création des processus (af_processes) ──────────────────
async function _activateProcesses(answers, organization_id){
  var acts  = answers.selected_activities || [];
  var toAdd = [];

  // Processus de base — toujours présents
  toAdd.push(
    { code:'FIN-001', label:'Clôture comptable et reporting financier', domain:'Finance',     base_risk:4, priority:'haute',  year:'An 1' },
    { code:'ACH-001', label:'Achats et référencement fournisseurs',      domain:'Achats',      base_risk:3, priority:'haute',  year:'An 1' },
    { code:'GOV-001', label:'Gouvernance et contrôle interne général',   domain:'Gouvernance', base_risk:3, priority:'moyenne',year:'An 2' }
  );

  // Processus selon les activités sélectionnées
  if(acts.includes('fabrication')){
    toAdd.push(
      { code:'PRD-001', label:'Contrôle qualité et conformité produit',   domain:'Opérations', base_risk:4, priority:'haute',  year:'An 1' },
      { code:'QHSE-001',label:'Hygiène, Sécurité, Environnement (QHSE)', domain:'Opérations', base_risk:4, priority:'haute',  year:'An 1' }
    );
  }
  if(acts.includes('stocks') || acts.includes('magasins')){
    toAdd.push(
      { code:'STK-001', label:'Gestion et valorisation des stocks',       domain:'Opérations', base_risk:4, priority:'haute',  year:'An 1' }
    );
  }
  if(acts.includes('magasins')){
    toAdd.push(
      { code:'RET-001', label:'Gestion des encaissements et caisses',     domain:'Commerce',   base_risk:4, priority:'haute',  year:'An 1' }
    );
  }
  if(acts.includes('transport')){
    toAdd.push(
      { code:'LOG-001', label:'Transport, logistique et supply chain',    domain:'Opérations', base_risk:3, priority:'moyenne',year:'An 2' }
    );
  }
  if(acts.includes('achats_int')){
    toAdd.push(
      { code:'INT-001', label:'Achats internationaux, douanes et change', domain:'Achats',     base_risk:5, priority:'haute',  year:'An 1' },
      { code:'INT-002', label:'Lutte anti-corruption (Sapin II / FCPA)',  domain:'Conformité', base_risk:5, priority:'haute',  year:'An 1' }
    );
  }
  if(acts.includes('it')){
    toAdd.push(
      { code:'IT-001',  label:'Sécurité SI et gestion des accès',         domain:'SI',         base_risk:5, priority:'haute',  year:'An 1' },
      { code:'IT-002',  label:'Plan de reprise d\'activité (PRA/PCA)',     domain:'SI',         base_risk:4, priority:'moyenne',year:'An 2' }
    );
  }

  // Colonnes conformes à af_processes dans migration.sql du projet 74SW
  // (organization_id, code, label, domain, base_risk + colonnes étendues SaaS)
  var rows = toAdd.map(function(p){
    return {
      organization_id: organization_id,
      code:            p.code,
      label:           p.label,
      domain:          p.domain,
      base_risk:       p.base_risk,
      status:          'actif',
      is_generated:    true,
      priority:        p.priority,
      planned_year:    p.year,
    };
  });

  var res = await getSB()
    .from('af_processes')
    .upsert(rows, { onConflict: 'organization_id,code' });

  if(res.error){
    throw new Error('Erreur création processus : ' + res.error.message);
  }
  return toAdd;
}

// ── 3. Création du plan d'audit (af_audit_plan) ───────────────
// Colonnes utilisées : titre, annee, type, statut, domaine,
//   organization_id, is_generated, notes
// → conformes au schéma du projet 74SW (loadAllData dans db.js)
async function _createAuditPlan(answers, organization_id){
  var year = new Date().getFullYear();
  var score = 0;
  var pts = { stocks:2, magasins:2, fabrication:3, transport:2, achats_int:3, it:3 };
  (answers.selected_activities||[]).forEach(function(a){ score += pts[a]||1; });
  var riskLabel = score>=9 ? 'Élevé' : score>=5 ? 'Modéré' : 'Faible';

  var plan = {
    organization_id: organization_id,
    titre:           'Plan d\'audit initial ' + year + '–' + (year+2) + ' (généré automatiquement)',
    annee:           year,
    type:            'Pluriannuel',
    statut:          'Planifié',
    domaine:         'Tous domaines',
    is_generated:    true,
    notes:           'Généré le ' + new Date().toLocaleDateString('fr-FR') +
                     ' | Profil de risque : ' + riskLabel + ' (' + score + ' pts)' +
                     ' | Activités : ' + ((answers.selected_activities||[]).join(', ')||'aucune'),
  };

  var res = await getSB()
    .from('af_audit_plan')
    .insert(plan)
    .select('id')
    .single();

  if(res.error){
    throw new Error('Erreur création plan d\'audit : ' + res.error.message);
  }
  return res.data.id;
}

// ── 4. Création des missions (af_audit_plan) ──────────────────
// Les missions sont des entrées af_audit_plan de type 'Process'
// — exactement comme les audits existants dans le projet 74SW.
// Quand vous aurez une table af_audit_missions dédiée, il suffira
// de changer le nom de table ici.
async function _createMissions(processes, planId, organization_id){
  var year = new Date().getFullYear();
  var yearOffset = { 'An 1':0, 'An 2':1, 'An 3':2 };

  var missions = processes.map(function(p){
    return {
      organization_id: organization_id,
      titre:           p.label,
      type:            'Process',
      domaine:         p.domain,
      statut:          'Planifié',
      annee:           year + (yearOffset[p.year]||0),
      is_generated:    true,
      // plan_id non présent dans le schéma 74SW actuel — ignoré pour l'instant
    };
  });

  var res = await getSB()
    .from('af_audit_plan')
    .insert(missions);

  if(res.error){
    // Non bloquant : le plan principal est créé, les missions sont un bonus
    console.warn('[AuditGen] Erreur création missions :', res.error.message);
  }
}

// ── 5. Marquer l'organisation comme configurée ────────────────
async function _markOrgAsConfigured(organization_id){
  // af_org_config
  await getSB()
    .from('af_org_config')
    .upsert({
      organization_id: organization_id,
      is_configured:   true,
      configured_at:   new Date().toISOString(),
    }, { onConflict: 'organization_id' });

  // organizations.is_configured (champ dénormalisé pour check rapide)
  var res = await getSB()
    .from('organizations')
    .update({
      is_configured:  true,
      configured_at:  new Date().toISOString(),
    })
    .eq('id', organization_id);

  if(res.error){
    console.warn('[AuditGen] organizations.is_configured :', res.error.message);
  }
}
