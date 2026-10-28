# Drivest — Plateforme numérique automobile

React + TypeScript + Vite + Tailwind CSS, Supabase (PostgreSQL, Auth, Storage), déploiement Vercel.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner l'URL et la clé anon Supabase
npm run dev
```

Sans `.env.local`, l'application démarre en **mode configuration** : un bandeau l'indique et
aucune donnée n'est chargée.

| Commande          | Rôle                                                          |
| ----------------- | ------------------------------------------------------------- |
| `npm run dev`     | Serveur de développement                                      |
| `npm run build`   | Vérification TypeScript + build de production (`dist/`)       |
| `npm run test:db` | Applique les migrations sur un Postgres embarqué (PGlite) et vérifie RLS, commandes, paiements, portefeuille, investissement, parrainage, audit |

## Mise en place de Supabase

1. Créer un projet Supabase.
2. Exécuter, dans l'ordre, les fichiers de `supabase/migrations/`
   (SQL Editor, ou `supabase db push` avec la CLI liée au projet).
3. Créer votre compte via la page **Créer un compte**, puis promouvoir ce compte en
   administrateur depuis le SQL Editor (aucune interface ne permet de s'attribuer un rôle) :

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'super_admin' from auth.users where email = 'votre-adresse@exemple.com';
   ```

4. Dans **Authentication > URL Configuration**, ajouter l'URL du site (locale et Vercel) aux
   *Redirect URLs* (confirmation d'e-mail et réinitialisation du mot de passe).
5. Dans l'application : **Administration > Paramètres** — renseigner les moyens de paiement réels,
   les instructions de paiement, les coordonnées officielles et les mentions légales.

## Déploiement Vercel

Importer le dépôt GitHub dans Vercel (preset Vite), puis ajouter les variables
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. `vercel.json` gère le routage SPA et des en-têtes
de sécurité. **Ne jamais** placer la clé `service_role` dans le frontend.

## Architecture

```
src/
  components/   UI réutilisable (layout, ui/, vehicles/, orders/, admin/)
  context/      Auth, paramètres plateforme, notifications visuelles
  hooks/        useAsync (chargement / erreur / rechargement)
  lib/          client Supabase, formatage, libellés FR, erreurs
  services/     accès aux données (une fonction = une requête ou un RPC)
  pages/        pages publiques, auth/, account/ (espace client), admin/
  types/        types métier alignés sur le schéma SQL
supabase/
  migrations/   schéma, RLS, fonctions métier, stockage
  tests/        vérification de la migration (PGlite)
```

## Sécurité — principes appliqués

- **RLS sur toutes les tables.** Un client ne lit que ses données ; le catalogue public ne montre
  que les véhicules publiés.
- **Privilèges par colonne** : un client ne peut modifier que `full_name`, `phone`, `city`,
  `country` de son profil (jamais `is_blocked`) ; les rôles sont dans `user_roles`, non modifiable
  depuis le navigateur.
- **Aucune écriture financière directe** : commandes, paiements, remboursements et transactions
  passent exclusivement par des fonctions SQL `SECURITY DEFINER` qui vérifient l'identité, le rôle,
  le statut et les montants.
- **Paiement ≠ déclaration** : le client déclare une référence (et un justificatif facultatif, stocké
  dans un bucket privé) ; seul un administrateur peut le vérifier. Une même référence ne peut être
  déclarée deux fois ; un seul paiement en attente par commande.
- **Anti double commande** : clé d'idempotence par soumission + verrou transactionnel + refus d'une
  seconde commande active sur le même véhicule.
- **Transitions de statut contrôlées côté serveur** ; « Paiement confirmé » et « Remboursée » ne sont
  atteignables que via les flux de vérification et de remboursement.
- **Journal d'audit** alimenté par triggers (catalogue, annonces, paramètres, rôles) et par les
  fonctions admin (paiements, commandes, remboursements, blocages, support).
- **Limitation** : 5 demandes de support par heure et par utilisateur ; les limites de connexion
  sont celles de Supabase Auth.

## Modules financiers (migration `20261026010000_drivest_financial_modules.sql`)

Activés par défaut ; chacun peut être coupé dans **Administration > Paramètres > Modules**.

- **Portefeuille** : solde calculé à partir du grand livre (`transactions`), jamais stocké. Affichage
  séparé du disponible, des montants en attente et des montants investis.
  - Dépôt : déclaré par le client (référence + justificatif), crédité seulement après validation admin.
  - Retrait : fonds bloqués dès la demande, frais (% + fixe) affichés avant confirmation, identité
    vérifiée exigée (paramétrable), versement confirmé par l'admin avec la référence du virement.
  - Paiement d'une commande directement depuis le solde.
  - Ajustements administratifs avec motif obligatoire, journalisés.
- **Vérification d'identité (KYC)** : pièce déposée dans un bucket privé, validée ou refusée par l'admin.
- **Investissement automobile** : offres avec nature juridique, rôle de la plateforme, actifs, montants
  min/max/objectif, durée, droits, frais, méthode de calcul, risques, conditions de sortie, de
  remboursement et de retrait, document contractuel versionné. Une offre ne peut quitter le brouillon
  que si toutes ces conditions sont rédigées. Le participant accepte les conditions et reconnaît les
  risques ; la participation est débitée de son portefeuille.
  - Distributions au prorata, avec description obligatoire de l'origine réelle des revenus.
  - Clôture avec restitution d'un pourcentage du capital (perte possible), sortie anticipée,
    annulation avec remboursement intégral.
- **Parrainage** : code et lien uniques, page « Mon équipe », commission en % sur les achats et/ou
  participations **confirmés** des filleuls (jamais sur la simple inscription), annulée en cas de
  remboursement.
- **Références réglementaires** (raison sociale, immatriculation, autorité, n° d'agrément) : saisies
  dans les paramètres et affichées sur les pages d'investissement et dans le pied de page.

## Points restant à fournir

- Références réglementaires, instructions de dépôt, frais de retrait et taux de parrainage :
  à saisir dans **Paramètres**.
- Coordonnées officielles, numéro WhatsApp, mentions légales : à saisir dans **Paramètres**.
- Instructions et moyens de paiement réels (aucune intégration Mobile Money n'est configurée).
- Photographies et fiches des véhicules réels : saisies par l'administration, aucune donnée fictive
  n'est fournie. Seules les 9 catégories de départ sont créées par la migration ; « Neufs » et
  « Occasion » sont gérés par le champ *État* du véhicule (filtres dédiés dans le catalogue).
- Sauvegardes : activer les sauvegardes / PITR dans le tableau de bord Supabase selon le plan choisi.
- Les métadonnées SEO sont définies côté client ; pour un référencement plus poussé, envisager un
  pré-rendu des pages publiques.
