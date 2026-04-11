# AuditFlow — Guide de déploiement Supabase

Ce guide explique comment déployer AuditFlow en utilisant **Supabase** comme base de données et stockage de fichiers, sans dépendance à SharePoint.

## Architecture

L'application est une "Single Page Application" (SPA) statique qui communique directement avec Supabase. Elle peut être hébergée sur n'importe quel serveur web statique (Vercel, Netlify, GitHub Pages, ou même un serveur local).

## Configuration de Supabase

1. **Créer un projet** sur [Supabase](https://app.supabase.com/).
2. **Base de données** : Exécutez le script SQL suivant dans le "SQL Editor" pour créer les tables :

```sql
-- Table des utilisateurs
create table af_users (
  id text primary key,
  email text unique,
  name text,
  role text,
  initials text,
  status text,
  pwd text, -- NOTE: En production, utilisez Supabase Auth ou hachez les mots de passe.
  created_at timestamp with time zone default now()
);

-- Table du plan d'audit
create table af_audit_plan (
  id text primary key,
  type text,
  titre text,
  annee integer,
  statut text,
  auditeurs jsonb,
  domaine text,
  process text,
  process_id text,
  entite text,
  region text,
  pays jsonb,
  updated_at timestamp with time zone default now()
);

-- Table des données d'audit (tâches, contrôles, findings)
create table af_audit_data (
  audit_id text primary key,
  tasks jsonb,
  controls jsonb,
  findings jsonb,
  mgt_resp jsonb,
  docs jsonb,
  notes text,
  maturity jsonb,
  updated_at timestamp with time zone default now()
);

-- Table des processus
create table af_processes (
  id text primary key,
  dom text,
  proc text,
  risk integer,
  archived boolean default false,
  y25 jsonb, y26 jsonb, y27 jsonb, y28 jsonb
);

-- Table des plans d'action
create table af_actions (
  id text primary key,
  title text,
  audit text,
  resp text,
  dept text,
  ent text,
  year integer,
  quarter text,
  status text,
  pct integer,
  from_finding boolean,
  finding_title text
);

-- Table de l'historique
create table af_history (
  id serial primary key,
  type text,
  msg text,
  user_name text,
  created_at timestamp with time zone default now()
);
```

3. **Stockage (Storage)** :
   - Créez un bucket appelé `auditflow-docs`.
   - Rendez-le **public** (ou configurez les politiques RLS pour l'accès).

## Installation de l'application

1. **Remplir config.js** :
   Ouvrez `config.js` et remplacez les valeurs par vos clés API Supabase (trouvées dans Settings > API) :
   ```javascript
   supabaseUrl: 'https://votre-projet.supabase.co',
   supabaseKey: 'votre-anon-key',
   ```

2. **Hébergement** :
   Déposez l'intégralité des fichiers sur votre service d'hébergement.
   L'application est accessible via le fichier `index.html`.

## Connexion par défaut

- **Email** : `pmassard@74Software.com`
- **Mot de passe** : `Audit1234!`

---
## Mode Démo
Si Supabase n'est pas configuré, l'application utilise les données d'exemple définies dans `js/data.js`.
