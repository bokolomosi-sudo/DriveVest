// Valide la migration Drivest sur un Postgres embarqué (PGlite) avec des stubs Supabase,
// puis exécute un scénario fonctionnel et des tests de sécurité.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const db = new PGlite();

const STUBS = `
create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, phone text unique, raw_user_meta_data jsonb default '{}',
  encrypted_password text, updated_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
create table auth.refresh_tokens (id bigserial primary key, user_id text);
-- pgcrypto vit dans le schéma « extensions » sur Supabase : simple imitation pour les tests
create schema extensions;
create function extensions.gen_salt(text) returns text language sql as $$ select 'sel' $$;
create function extensions.crypt(text, text) returns text language sql as $$ select md5($1 || $2) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Privilèges par défaut de Supabase (que la migration doit restreindre)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const CLIENT = '00000000-0000-0000-0000-00000000000c';
const OTHER = '00000000-0000-0000-0000-00000000000d';

let failures = 0;
const ok = (name) => console.log(`  ✔ ${name}`);
const fail = (name, detail) => { failures++; console.log(`  ✘ ${name}: ${detail}`); };

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function expectOk(name, fn) {
  try { const r = await fn(); ok(name); return r; } catch (e) { fail(name, e.message); }
}
// Dépôt validé par l'admin (condition d'achat et de retrait)
async function approvedDeposit(uid, amount = 1000) {
  await db.query(`insert into transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction)
    values ($1, 'deposit', $2, 'CDF', 'confirmed', new_transaction_reference(), 'Dépôt de test validé', true, 'credit')`, [uid, amount]);
}
async function expectError(name, fn, pattern) {
  try { await fn(); fail(name, 'aucune erreur levée'); }
  catch (e) { if (!pattern || pattern.test(e.message)) ok(`${name} → « ${e.message} »`); else fail(name, e.message); }
}

console.log('1. Application de la migration');
await db.exec(STUBS);
for (const file of migrations) {
  await db.exec(readFileSync(migrationsDir + file, 'utf8'));
  ok(`${file} appliquée sans erreur`);
}
await db.exec(`update platform_settings set signup_bonus = 0 where id = 1`);

const migratedMin = Number((await db.query(`select min_withdrawal from platform_settings where id = 1`)).rows[0].min_withdrawal);
console.log('2. Inscription (trigger profil + rôle)');
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ADMIN}', 'admin@test.local', '{"full_name":"Admin Test"}'),
  ('${CLIENT}', 'client@test.local', '{"full_name":"Client Test","phone":"+000"}'),
  ('${OTHER}', 'other@test.local', '{}');`);
const prof = await db.query(`select count(*)::int n from profiles`);
prof.rows[0].n === 3 ? ok('3 profils créés') : fail('profils', JSON.stringify(prof.rows));
// L'admin de test est super administrateur (il règle les paramètres de la plateforme)
await db.exec(`insert into user_roles (user_id, role) values ('${ADMIN}', 'admin'), ('${ADMIN}', 'super_admin')`);

console.log('3. Sécurité des rôles et profils');
await expectError('client ne peut pas se donner le rôle admin', () => as(CLIENT, `insert into user_roles (user_id, role) values ('${CLIENT}', 'admin')`), /permission denied/);
await expectError('client ne peut pas se débloquer / modifier is_blocked', () => as(CLIENT, `update profiles set is_blocked = false where id = '${CLIENT}'`), /permission denied/);
await expectOk('client peut modifier son nom', () => as(CLIENT, `update profiles set full_name = 'Nouveau' where id = '${CLIENT}'`));
const otherProf = await as(CLIENT, `update profiles set full_name = 'Pirate' where id = '${OTHER}' returning id`);
otherProf.rows.length === 0 ? ok("client ne peut pas modifier le profil d'un autre") : fail('profil autre', 'modifié');
const anonProfiles = await expectError('anonyme ne lit pas les profils', () => as(null, `select * from profiles`), /permission denied/);
void anonProfiles;
await expectError("client n'appelle pas les fonctions admin", () => as(CLIENT, `select admin_dashboard_stats()`), /administrateurs/);
await expectError('anonyme ne peut pas créer de commande', () => as(null, `select create_order(gen_random_uuid(), gen_random_uuid())`), /permission denied/);
const flagChange = await as(CLIENT, `update platform_settings set feature_investment = false returning id`);
flagChange.rows.length === 0 ? ok('un client ne peut pas modifier les modules') : fail('modules', 'modifiés par un client');

console.log('4. Catalogue');
await expectError('client ne peut pas créer de véhicule', () => as(CLIENT, `insert into vehicles (brand, model, condition) values ('X','Y','new')`), /row-level security/);
const cat = await db.query(`select id from vehicle_categories where slug = 'berlines'`);
const v = await expectOk('admin crée un véhicule publié', () => as(ADMIN,
  `insert into vehicles (category_id, brand, model, year, price, currency, condition, status, duration_days) values ($1, 'Toyota', 'Corolla', 2022, 15000, 'CDF', 'used', 'published', 30) returning id, published_at`, [cat.rows[0].id]));
const vehicleId = v.rows[0].id;
v.rows[0].published_at ? ok('published_at renseigné automatiquement') : fail('published_at', 'null');
await expectError('produit publié sans prix refusé', () => as(ADMIN, `insert into vehicles (category_id, brand, model, condition, currency, status, duration_days) values ($1, 'Sans', 'Prix', 'new', 'CDF', 'published', 30)`, [cat.rows[0].id]), /published_requires_price_duration/);
const draft = await as(ADMIN, `insert into vehicles (brand, model, condition) values ('Brouillon', 'Z', 'new') returning id`);
const anonSee = await as(null, `select id from vehicles`);
anonSee.rows.length === 1 && anonSee.rows[0].id === vehicleId ? ok('anonyme ne voit que les véhicules publiés') : fail('visibilité', JSON.stringify(anonSee.rows));
void draft;

console.log('5. Commande et idempotence');
const key = 'aaaaaaaa-0000-0000-0000-000000000001';
const o1 = await as(CLIENT, `select * from create_order($1, $2, 'note', 'Kinshasa')`, [vehicleId, key]);
const o2 = await as(CLIENT, `select * from create_order($1, $2)`, [vehicleId, key]);
o1.rows[0].id === o2.rows[0].id ? ok(`double soumission → même commande ${o1.rows[0].order_number}`) : fail('idempotence', 'deux commandes');
const orderId = o1.rows[0].id;
await expectError('deuxième commande active sur le même véhicule refusée', () => as(CLIENT, `select create_order($1, gen_random_uuid())`, [vehicleId]), /déjà ce produit en cours/);
const otherSee = await as(OTHER, `select id from orders`);
otherSee.rows.length === 0 ? ok("un client ne voit pas les commandes d'un autre") : fail('RLS orders', 'visible');
await expectError('client ne peut pas modifier le statut directement', () => as(CLIENT, `update orders set status = 'delivered' where id = $1`, [orderId]), /permission denied/);
await expectError("client ne peut pas s'insérer un paiement vérifié", () => as(CLIENT, `insert into payments (order_id, user_id, amount, currency, method, reference, status) values ($1, $2, 15000, 'CDF', 'x', 'abc', 'verified')`, [orderId, CLIENT]), /permission denied/);

console.log('6. Paiement déclaré puis vérifié');
await expectError('montant supérieur au reste refusé', () => as(CLIENT, `select submit_payment($1, 'Virement', 'REF-1', 20000)`, [orderId]), /Montant invalide/);
const pay = await expectOk('client déclare un paiement', () => as(CLIENT, `select * from submit_payment($1, 'Virement', 'REF-123', 15000)`, [orderId]));
const st1 = await db.query(`select status from orders where id = $1`, [orderId]);
st1.rows[0].status === 'payment_verification' ? ok('commande → payment_verification (pas payée)') : fail('statut', st1.rows[0].status);
await expectError('second paiement en attente refusé', () => as(CLIENT, `select submit_payment($1, 'Virement', 'REF-456', 1)`, [orderId]), /déjà en cours/);
await expectError('refus sans motif impossible', () => as(ADMIN, `select admin_review_payment($1, false, '')`, [pay.rows[0].id]), /motif/);
await expectOk('admin vérifie le paiement', () => as(ADMIN, `select admin_review_payment($1, true)`, [pay.rows[0].id]));
await expectError('double vérification refusée', () => as(ADMIN, `select admin_review_payment($1, true)`, [pay.rows[0].id]), /déjà été traité/);
const st2 = await db.query(`select o.status, t.status tx from orders o join transactions t on t.order_id = o.id where o.id = $1`, [orderId]);
st2.rows[0].status === 'payment_confirmed' && st2.rows[0].tx === 'confirmed' ? ok('commande payment_confirmed, transaction confirmée') : fail('après vérif', JSON.stringify(st2.rows));
await expectError('annulation client impossible après paiement', () => as(CLIENT, `select cancel_my_order($1)`, [orderId]), /ne peut plus être annulée|remboursement/);

console.log('7. Avancement de la commande');
await expectError('saut de statut interdit', () => as(ADMIN, `select admin_set_order_status($1, 'delivered')`, [orderId]), /non autorisée/);
await expectOk('payment_confirmed → confirmed', () => as(ADMIN, `select admin_set_order_status($1, 'confirmed', 'OK')`, [orderId]));
const av = await db.query(`select availability from vehicles where id = $1`, [vehicleId]);
av.rows[0].availability === 'reserved' ? ok('véhicule réservé') : fail('réservation', av.rows[0].availability);

console.log('8. Remboursements retirés');
await expectError('demande de remboursement refusée', () => as(CLIENT, `select request_refund($1, 'Changement de projet')`, [orderId]), /permission denied|does not exist/);
await expectError('traitement de remboursement refusé', () => as(ADMIN, `select admin_process_refund(gen_random_uuid(), 'approved')`), /permission denied|does not exist/);
// Le véhicule réservé par la commande confirmée est remis en vente pour la suite des tests
await as(ADMIN, `update vehicles set availability = 'available' where id = $1`, [vehicleId]);

console.log('9. Blocage, support, audit');
await expectError('blocage sans motif refusé', () => as(ADMIN, `select admin_set_user_blocked($1, true, '')`, [CLIENT]), /motif/);
await expectOk('admin bloque le client', () => as(ADMIN, `select admin_set_user_blocked($1, true, 'Fraude suspectée')`, [CLIENT]));
await expectError('client bloqué ne peut plus commander', () => as(CLIENT, `select create_order($1, gen_random_uuid())`, [vehicleId]), /suspendu/);
await expectError('client bloqué ne peut pas écrire au support', () => as(CLIENT, `insert into support_requests (user_id, subject, message) values ($1, 'Sujet', 'Message assez long')`, [CLIENT]), /row-level security/);
for (let i = 0; i < 5; i++) await as(OTHER, `insert into support_requests (user_id, subject, message) values ($1, 'Sujet', 'Message assez long')`, [OTHER]);
await expectError('limite de 5 demandes/heure', () => as(OTHER, `insert into support_requests (user_id, subject, message) values ($1, 'Sujet', 'Message assez long')`, [OTHER]), /Trop de demandes/);
await expectError("le support ne peut pas être forgé avec une réponse admin", () => as(OTHER, `insert into support_requests (user_id, subject, message, admin_response) values ($1, 'Sujet', 'Message assez long', 'fake')`, [OTHER]), /permission denied/);
const audit = await as(ADMIN, `select action from audit_logs`);
const actions = new Set(audit.rows.map((r) => r.action));
['payment.verify', 'order.status', 'user.block', 'insert'].every((a) => actions.has(a))
  ? ok(`journal d'audit alimenté (${audit.rows.length} entrées)`) : fail('audit', [...actions].join(','));
await expectError('client ne lit pas le journal', async () => { const r = await as(OTHER, `select * from audit_logs`); if (r.rows.length === 0) throw new Error('0 ligne visible (RLS)'); }, /0 ligne/);
const stats = await as(ADMIN, `select admin_dashboard_stats() s`);
ok(`statistiques admin : ${JSON.stringify(stats.rows[0].s)}`);

console.log('10. Parrainage et portefeuille');
const INV = '00000000-0000-0000-0000-0000000000e1';
const code = (await db.query(`select referral_code from profiles where id = $1`, [OTHER])).rows[0].referral_code;
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${INV}', 'inv@test.local', '{"full_name":"Jean Investisseur","referral_code":"${code.toLowerCase()}"}')`);
const refBy = (await db.query(`select referred_by from profiles where id = $1`, [INV])).rows[0].referred_by;
refBy === OTHER ? ok('code de parrainage rattaché à l\'inscription') : fail('parrainage', String(refBy));
await as(ADMIN, `update platform_settings set referral_commission_percent = 5, referral_on_orders = true, referral_on_investments = true,
  withdrawal_fee_percent = 1, withdrawal_fee_fixed = 1, min_withdrawal = 10`);
await expectError("client ne peut pas s'écrire une transaction", () => as(INV, `insert into transactions (user_id, type, amount, currency, reference, wallet) values ($1, 'deposit', 999999, 'CDF', 'X', true)`, [INV]), /permission denied/);

const bal = async (uid, cur = 'CDF') => Number((await db.query(`select wallet_available($1, $2) v`, [uid, cur])).rows[0].v);
const dep = await expectOk('dépôt déclaré', () => as(INV, `select * from request_deposit(1000, 'cdf', 'Virement', 'DEP-001', null, gen_random_uuid())`));
(await bal(INV)) === 0 ? ok('dépôt non crédité avant vérification') : fail('dépôt', 'crédité trop tôt');
await expectError('même référence de dépôt refusée', () => as(OTHER, `select request_deposit(50, 'CDF', 'virement', 'dep-001', null, gen_random_uuid())`), /déjà été déclarée/);
await expectError("client ne valide pas son propre dépôt", () => as(INV, `select admin_review_deposit($1, true)`, [dep.rows[0].id]), /administrateurs/);
await as(ADMIN, `select admin_review_deposit($1, true)`, [dep.rows[0].id]);
(await bal(INV)) === 1000 ? ok('dépôt crédité après vérification : 1000') : fail('solde', await bal(INV));

await expectError('retrait refusé sans produit acheté', () => as(INV, `select request_withdrawal_with_password(100, '1234', gen_random_uuid())`), /acheté au moins un produit/);
// Achat simulé (commande réglée) pour tester la suite du parcours de retrait
await db.exec(`insert into orders (user_id, status, total_amount, currency, idempotency_key) values ('${INV}', 'payment_confirmed', 0, 'CDF', gen_random_uuid())`);
await expectError('retrait sans portefeuille configuré refusé', () => as(INV, `select request_withdrawal_with_password(100, '1234', gen_random_uuid())`), /Configurez/);
await expectError('ancien retrait sans mot de passe bloqué', () => as(INV, `select request_withdrawal(100, 'CDF', 'Mobile', '+000111', gen_random_uuid())`), /permission denied/);
await expectError('numéro Airtel invalide refusé', () => as(INV, `select set_withdrawal_account('Airtel Money', 'Jean', '12345', '1234')`), /invalide/);
await expectOk('portefeuille de retrait configuré', () => as(INV, `select set_withdrawal_account('Airtel Money', 'Jean Investisseur', '243971234567', '1234')`));
await expectError('reconfiguration refusée', () => as(INV, `select set_withdrawal_account('Airtel Money', 'Autre', '243971234567', '9999')`), /déjà configuré/);
await expectError('mot de passe haché illisible', () => as(INV, `select * from withdrawal_accounts`), /permission denied/);
const acc = await as(INV, `select * from get_my_withdrawal_account()`);
acc.rows[0]?.airtel_number === '243971234567' ? ok('portefeuille de retrait lisible par son titulaire') : fail('portefeuille', JSON.stringify(acc.rows));
const bad = await as(INV, `select (request_withdrawal_with_password(100, '0000', gen_random_uuid())).id`);
bad.rows[0].id === null && (await bal(INV)) === 1000 ? ok('mauvais mot de passe : aucun retrait créé') : fail('mot de passe', JSON.stringify(bad.rows));
const w1 = await as(INV, `select * from request_withdrawal_with_password(100, '1234', gen_random_uuid())`);
w1.rows[0].status === 'pending' && w1.rows[0].method === 'Airtel Money' ? ok('retrait en traitement bancaire') : fail('retrait', JSON.stringify(w1.rows[0]));
(await bal(INV)) === 900 && Number(w1.rows[0].amount) === 98 ? ok('retrait 100 (98 envoyés + 2 de frais) → disponible 900') : fail('retrait', await bal(INV));
await expectError('refus sans motif impossible', () => as(ADMIN, `select admin_process_withdrawal($1, false)`, [w1.rows[0].id]), /motif/);
await as(ADMIN, `select admin_process_withdrawal($1, false, 'Numéro Airtel injoignable')`, [w1.rows[0].id]);
const r1 = await db.query(`select status, rejection_reason from transactions where id = $1`, [w1.rows[0].id]);
r1.rows[0].status === 'rejected' && (await bal(INV)) === 1000 ? ok('retrait refusé avec motif → fonds libérés') : fail('refus', JSON.stringify(r1.rows));
await expectError('retrait supérieur au solde refusé', () => as(INV, `select request_withdrawal_with_password(1001, '1234', gen_random_uuid())`), /insuffisant/);
const w2 = await as(INV, `select * from request_withdrawal_with_password(100, '1234', gen_random_uuid())`);
await as(ADMIN, `select admin_process_withdrawal($1, true)`, [w2.rows[0].id]);
const r2 = await db.query(`select status from transactions where id = $1`, [w2.rows[0].id]);
r2.rows[0].status === 'confirmed' && (await bal(INV)) === 900 ? ok('retrait confirmé sans référence → disponible 900') : fail('confirmation', JSON.stringify(r2.rows));
for (let i = 0; i < 5; i++) await as(INV, `select request_withdrawal_with_password(10, 'faux', gen_random_uuid())`);
await expectError('5 erreurs → blocage temporaire', () => as(INV, `select request_withdrawal_with_password(10, '1234', gen_random_uuid())`), /Trop d'essais/);
await db.exec(`update withdrawal_accounts set locked_until = null, failed_attempts = 0`);
const dest = await db.query(`select destination from transactions where id = $1`, [w2.rows[0].id]);
dest.rows[0].destination.startsWith('0971234567') ? ok('numéro Airtel affiché au format 0…') : fail('format numéro', dest.rows[0].destination);
await as(ADMIN, `update platform_settings set min_withdrawal = 5000`);
await expectError('retrait sous 5 000 FC refusé', () => as(INV, `select request_withdrawal_with_password(4999, '1234', gen_random_uuid())`), /minimum de retrait est de 5000/);
await as(ADMIN, `update platform_settings set min_withdrawal = 10`);

console.log('11. Offres d\'investissement retirées');
const investFlag = await db.query(`select feature_investment from platform_settings where id = 1`);
investFlag.rows[0].feature_investment === false ? ok('module investissement désactivé') : fail('investissement', 'encore actif');
await expectError('participation refusée', () => as(INV, `select invest(gen_random_uuid(), 300, true, gen_random_uuid())`), /permission denied|does not exist/);

console.log('12. Paiement de commande par portefeuille');
const o3 = await as(INV, `select * from create_order($1, gen_random_uuid())`, [vehicleId]);
await expectError('solde insuffisant refusé', () => as(INV, `select pay_order_with_wallet($1)`, [o3.rows[0].id]), /insuffisant/);
await expectError('ajustement sans motif refusé', () => as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'x')`, [INV]), /motif/);
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Apport validé par la direction, pièce n°42')`, [INV]);
await as(INV, `select pay_order_with_wallet($1)`, [o3.rows[0].id]);
const st4 = await db.query(`select status from orders where id = $1`, [o3.rows[0].id]);
st4.rows[0].status === 'payment_confirmed' && (await bal(INV)) === 5900 ? ok('commande payée depuis le portefeuille') : fail('paiement portefeuille', st4.rows[0].status + ' ' + await bal(INV));
(await bal(OTHER)) === 0 ? ok('parrain sans achat : aucune commission sur la commande du filleul') : fail('commission sans achat', await bal(OTHER));
const refs = await as(OTHER, `select * from my_referrals()`);
refs.rows.length === 1 && refs.rows[0].display_name === 'Jean I.' ? ok(`équipe de parrainage : ${refs.rows[0].display_name}`) : fail('équipe', JSON.stringify(refs.rows));
const leak = await as(OTHER, `select id from investment_participations`);
leak.rows.length === 0 ? ok("le parrain ne voit pas les participations de son filleul") : fail('RLS participations', 'visible');

console.log('13. Parrainage sur 3 niveaux (25 % / 5 % / 1 %)');
const [R1, R2, R3, B] = ['f1', 'f2', 'f3', 'f4'].map((s) => `00000000-0000-0000-0000-0000000000${s}`);
const codeOf = async (id) => (await db.query(`select referral_code from profiles where id = $1`, [id])).rows[0].referral_code;
await db.exec(`insert into auth.users (id, email) values ('${R1}', 'r1@test.local')`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${R2}', 'r2@test.local', '{"referral_code":"${await codeOf(R1)}"}')`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${R3}', 'r3@test.local', '{"referral_code":"${await codeOf(R2)}"}')`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${B}', 'b@test.local', '{"referral_code":"${await codeOf(R3)}"}')`);
await as(ADMIN, `update platform_settings set referral_commission_percent = 25, referral_level2_percent = 5, referral_level3_percent = 1, referral_on_orders = true`);
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Approvisionnement de test pour le parrainage')`, [B]);
await expectError('achat refusé sans dépôt validé', () => as(B, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [vehicleId]), /dépôt validé/);
await approvedDeposit(B);
// Achats simulés : R3 (niveau 1) et R1 (niveau 3) ont acheté, R2 (niveau 2) non
const simulated = await db.query(`insert into orders (user_id, status, total_amount, currency, idempotency_key)
  values ('${R3}', 'payment_confirmed', 0, 'CDF', gen_random_uuid()), ('${R1}', 'payment_confirmed', 0, 'CDF', gen_random_uuid()) returning id`);
await expectOk('le filleul achète avec son portefeuille', () => as(B, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [vehicleId]));
const lv = [await bal(R3, 'CDF'), await bal(R2, 'CDF'), await bal(R1, 'CDF')];
lv[0] === 3750 && lv[1] === 0 && lv[2] === 150
  ? ok('commissions 25 % / 1 % versées (3 750 / 150), rien pour le niveau 2 qui n\'a pas acheté')
  : fail('3 niveaux', JSON.stringify(lv));
// Retour à l'état « sans achat » pour R1 et R3 (utilisé par la suite des tests)
await db.query(`update orders set status = 'cancelled' where id = any($1::uuid[])`, [simulated.rows.map((r) => r.id)]);
const team = await as(R1, `select level from my_referrals()`);
JSON.stringify(team.rows.map((r) => r.level)) === '[1,2,3]' ? ok('équipe visible sur 3 niveaux') : fail('équipe', JSON.stringify(team.rows));
await expectError('produit en dollars refusé', () => as(ADMIN, `insert into vehicles (brand, model, condition, currency) values ('X', 'Y', 'new', 'USD')`), /vehicles_currency_cdf/);

console.log('14. Bonus d\'inscription');
await as(ADMIN, `update platform_settings set signup_bonus = 100`);
const NEW1 = '00000000-0000-0000-0000-0000000000b1';
const NEW2 = '00000000-0000-0000-0000-0000000000b2';
await db.exec(`insert into auth.users (id, email) values ('${NEW1}', 'n1@test.local')`);
(await bal(NEW1, 'CDF')) === 100 ? ok('bonus de 100 FC crédité à l\'inscription') : fail('bonus', await bal(NEW1, 'CDF'));
await as(ADMIN, `update platform_settings set signup_bonus = 50`);
await db.exec(`insert into auth.users (id, email) values ('${NEW2}', 'n2@test.local')`);
(await bal(NEW2, 'CDF')) === 50 ? ok('bonus réduit par l\'admin : 50 FC') : fail('bonus réduit', await bal(NEW2, 'CDF'));
const notAdmin = await as(NEW1, `update platform_settings set signup_bonus = 99999 returning id`);
notAdmin.rows.length === 0 ? ok('un client ne peut pas changer le bonus') : fail('bonus', 'modifié par un client');

console.log('15. Règles de retrait et équipe');
await as(ADMIN, `update platform_settings set min_withdrawal = 6000, withdrawal_fee_percent = 30, withdrawal_fee_fixed = 0`);
await as(R1, `select set_withdrawal_account('Airtel Money', 'Membre Un', '243971111111', '1234')`);
await as(ADMIN, `select admin_wallet_adjustment($1, 10000, 'CDF', 'credit', 'Test retrait sans achat')`, [R1]);
await expectError('retrait refusé sans produit acheté (membre parrain)', () => as(R1, `select * from request_withdrawal_with_password(7000, '1234', gen_random_uuid())`), /acheté au moins un produit/);
await as(B, `select set_withdrawal_account('Airtel Money', 'Membre B', '243972222222', '4321')`);
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Test retrait')`, [B]);
const beforeB = await bal(B, 'CDF');
await expectError('retrait sous 6 000 FC refusé', () => as(B, `select * from request_withdrawal_with_password(5000, '4321', gen_random_uuid())`), /minimum/);
const wd = await as(B, `select * from request_withdrawal_with_password(10000, '4321', gen_random_uuid())`);
const afterB = await bal(B, 'CDF');
Number(wd.rows[0].amount) === 7000 && beforeB - afterB === 10000
  ? ok('10 000 FC demandés : 7 000 FC envoyés, solde -10 000 FC')
  : fail('frais 30 %', JSON.stringify({ net: wd.rows[0].amount, debit: beforeB - afterB }));
await expectError('le membre ne peut plus annuler un retrait', () => as(B, `select cancel_my_withdrawal($1)`, [wd.rows[0].id]), /permission denied/);
const myTeam = await as(R3, `select level, has_invested, phone from my_team()`);
myTeam.rows.length === 1 && myTeam.rows[0].has_invested === true
  ? ok('équipe : invité ayant investi identifié')
  : fail('my_team', JSON.stringify(myTeam.rows));
const deep = await as(R1, `select level, has_invested, phone from my_team() order by level`);
deep.rows.length === 3 && deep.rows[1].has_invested === false && deep.rows[2].has_invested === true
  ? ok('équipe sur 3 niveaux avec statut d\'achat, numéro masqué au niveau 3')
  : fail('my_team 3 niveaux', JSON.stringify(deep.rows));
(await as(B, `select i_have_purchased() as v`)).rows[0].v === true && (await as(R1, `select i_have_purchased() as v`)).rows[0].v === false
  ? ok('i_have_purchased correct')
  : fail('i_have_purchased', '');
await expectError('has_purchased_product non exposée', () => as(R1, `select has_purchased_product($1)`, [B]), /permission denied/);

console.log('16. Informations du membre et récompenses d\'équipe');
migratedMin === 5000 ? ok('retrait minimum : 5 000 FC') : fail('minimum', migratedMin);
await expectError('province hors liste refusée', () => as(R3, `select complete_my_profile('Marie Kabila', 'Paris', 'Goma')`), /province/);
await expectError('nom vide refusé', () => as(R3, `select complete_my_profile(' ', 'Nord-Kivu', 'Goma')`), /nom/);
await expectOk('profil complété', () => as(R3, `select complete_my_profile('Marie Kabila', 'Nord-Kivu', 'Goma')`));
const prof16 = await db.query(`select full_name, province, city from profiles where id = $1`, [R3]);
prof16.rows[0].province === 'Nord-Kivu' && prof16.rows[0].city === 'Goma' ? ok('province et ville enregistrées') : fail('profil', JSON.stringify(prof16.rows));

await expectError('un client ne modifie pas les paliers', () => as(R3, `select admin_set_team_reward_tiers('[{"invited_count":1,"amount":99999}]')`), /administrat/);
const grantsOf = async (uid) => (await db.query(`select invited_count, amount from team_reward_grants where user_id = $1 order by invited_count`, [uid])).rows;
await as(ADMIN, `select admin_set_team_reward_tiers('[{"invited_count":1,"amount":500},{"invited_count":2,"amount":1000}]')`);
(await grantsOf(R3)).length === 0
  ? ok('palier atteint mais aucun achat personnel : pas de récompense')
  : fail('récompense sans achat', JSON.stringify(await grantsOf(R3)));
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Test achat du parrain')`, [R3]);
await approvedDeposit(R3);
const r3Before = await bal(R3, 'CDF');
await as(R3, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [vehicleId]);
const r3After = await bal(R3, 'CDF');
(await grantsOf(R3)).length === 1 && r3After - r3Before === 500 - 15000
  ? ok('palier déjà atteint crédité dès le premier achat du parrain : +500 FC')
  : fail('palier au premier achat', JSON.stringify({ grants: await grantsOf(R3), diff: r3After - r3Before }));
await as(ADMIN, `select admin_set_team_reward_tiers('[{"invited_count":1,"amount":500},{"invited_count":2,"amount":1000}]')`);
(await grantsOf(R3)).length === 1 ? ok('pas de double versement') : fail('doublon', JSON.stringify(await grantsOf(R3)));

const C = '00000000-0000-0000-0000-0000000000c1';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${C}', 'c@test.local', '{"referral_code":"${await codeOf(R3)}"}')`);
const progress1 = await as(R3, `select invested_invitees from my_team_rewards() limit 1`);
progress1.rows[0].invested_invitees === 1 ? ok('un inscrit sans achat ne compte pas') : fail('progression', JSON.stringify(progress1.rows));
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Test récompense d''équipe')`, [C]);
await approvedDeposit(C);
await as(C, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [vehicleId]);
const g2 = await grantsOf(R3);
g2.length === 2 && Number(g2[1].amount) === 1000 ? ok('2e invité qui achète : palier de 1 000 FC versé automatiquement') : fail('palier auto', JSON.stringify(g2));
const rew = await as(R3, `select invited_count, granted_at from my_team_rewards()`);
rew.rows.length === 2 && rew.rows.every((r) => r.granted_at) ? ok('paliers obtenus visibles par le membre') : fail('my_team_rewards', JSON.stringify(rew.rows));

await db.exec(`update profiles set phone = '243971110002' where id = '${R3}'; update profiles set phone = '243971110003' where id = '${B}'`);
const t1 = await as(R1, `select level, phone, province from my_team() order by level`);
const lvl2 = t1.rows.find((r) => r.level === 2);
const lvl3 = t1.rows.find((r) => r.level === 3 && r.phone);
lvl2?.phone === '0971110002' && lvl2?.province === 'Nord-Kivu' && lvl3?.phone.includes('•••')
  ? ok('numéro visible aux niveaux 1 et 2, masqué au niveau 3')
  : fail('numéros équipe', JSON.stringify(t1.rows));

console.log('17. Outils d\'administration');
await expectError('un client ne crée pas de compte de dépôt', () => as(R3, `insert into deposit_channels (name, account_number) values ('Airtel Money', '0990000000')`), /row-level security|permission denied/);
await expectOk('l\'admin crée un compte de dépôt', () => as(ADMIN, `insert into deposit_channels (name, account_number, account_name, ussd_code) values ('Airtel Money', '0990000000', 'Drivest', '*501#')`));
await as(ADMIN, `insert into deposit_channels (name, account_number, is_active) values ('Ancien compte', '0990000001', false)`);
const seen = await as(R3, `select name from deposit_channels`);
seen.rows.length === 1 && seen.rows[0].name === 'Airtel Money' ? ok('le client ne voit que les comptes actifs') : fail('comptes de dépôt', JSON.stringify(seen.rows));

await db.exec(`update auth.users set encrypted_password = 'ancien' where id = '${R3}'; insert into auth.sessions (user_id) values ('${R3}'); insert into auth.refresh_tokens (user_id) values ('${R3}')`);
await expectError('un client ne réinitialise pas un mot de passe', () => as(R3, `select admin_reset_user_password($1, '123456')`, [R2]), /administrateurs/);
await expectError('mot de passe provisoire trop court', () => as(ADMIN, `select admin_reset_user_password($1, '12345')`, [R3]), /6 caractères/);
await as(ADMIN, `select admin_reset_user_password($1, 'nouveau1')`, [R3]);
const pw = await db.query(`select encrypted_password from auth.users where id = $1`, [R3]);
const sessions = await db.query(`select (select count(*) from auth.sessions where user_id = $1)::int + (select count(*) from auth.refresh_tokens where user_id = $1::text)::int as n`, [R3]);
pw.rows[0].encrypted_password !== 'ancien' && sessions.rows[0].n === 0
  ? ok('mot de passe réinitialisé, sessions fermées')
  : fail('réinitialisation', JSON.stringify({ pw: pw.rows[0], sessions: sessions.rows[0] }));

await expectError('réinitialisation du portefeuille sans motif', () => as(ADMIN, `select admin_reset_withdrawal_account($1, ' ')`, [B]), /motif/);
await as(ADMIN, `select admin_reset_withdrawal_account($1, 'Mot de passe de retrait oublié')`, [B]);
(await as(B, `select * from get_my_withdrawal_account()`)).rows.length === 0
  ? ok('portefeuille de retrait réinitialisé : le membre peut le reconfigurer')
  : fail('portefeuille', 'toujours présent');

const ov = await as(ADMIN, `select admin_user_overview($1) as o`, [R3]);
const o = ov.rows[0].o;
o.team_level1 === 2 && o.invested_invitees === 2 && Number(o.total_rewards) === 1500 && o.sponsor?.id === R2
  ? ok('fiche membre : équipe, récompenses et parrain')
  : fail('fiche membre', JSON.stringify(o));
await expectError('fiche membre réservée à l\'admin', () => as(R3, `select admin_user_overview($1)`, [R3]), /administrateurs/);

console.log('18. Réseaux de retrait');
await expectError('un client n\'ajoute pas de réseau', () => as(C, `insert into withdrawal_networks (name) values ('Faux réseau')`), /row-level security|permission denied/);
await expectOk('l\'admin ajoute Orange Money', () => as(ADMIN, `insert into withdrawal_networks (name, sort_order) values ('Orange Money', 1)`));
await as(ADMIN, `insert into withdrawal_networks (name, is_active) values ('Réseau masqué', false)`);
const nets = await as(C, `select name from withdrawal_networks order by sort_order`);
JSON.stringify(nets.rows.map((r) => r.name)) === '["Airtel Money","Orange Money"]' ? ok('le membre voit les réseaux actifs') : fail('réseaux', JSON.stringify(nets.rows));
await expectError('réseau masqué refusé', () => as(C, `select set_withdrawal_account('Réseau masqué', 'Membre C', '243851112222', '1234')`), /réseau/);
await expectOk('portefeuille configuré sur Orange Money', () => as(C, `select set_withdrawal_account('Orange Money', 'Membre C', '243851112222', '1234')`));
const accC = await as(C, `select * from get_my_withdrawal_account()`);
accC.rows[0]?.network === 'Orange Money' ? ok('réseau enregistré') : fail('réseau', JSON.stringify(accC.rows));
await as(ADMIN, `update platform_settings set min_withdrawal = 1000`);
await as(ADMIN, `select admin_wallet_adjustment($1, 10000, 'CDF', 'credit', 'Test retrait Orange')`, [C]);
const wdC = await as(C, `select * from request_withdrawal_with_password(2000, '1234', gen_random_uuid())`);
wdC.rows[0].method === 'Orange Money' && wdC.rows[0].destination.startsWith('0851112222') ? ok('retrait envoyé vers Orange Money') : fail('retrait Orange', JSON.stringify(wdC.rows[0]));
await as(ADMIN, `select admin_process_withdrawal($1, true)`, [wdC.rows[0].id]);
const noteC = await db.query(`select body from notifications where user_id = $1 order by created_at desc limit 1`, [C]);
noteC.rows[0].body.includes('Orange Money') ? ok('notification avec le bon réseau') : fail('notification', noteC.rows[0].body);
const ovC = await as(ADMIN, `select admin_user_overview($1) as o`, [C]);
ovC.rows[0].o.withdrawal_account?.network === 'Orange Money' ? ok('fiche admin : réseau visible') : fail('fiche réseau', JSON.stringify(ovC.rows[0].o.withdrawal_account));

console.log('19. Liste des utilisateurs');
const ub = await as(ADMIN, `select user_id, balance from admin_users_balances($1)`, [[C, R3]]);
ub.rows.length === 2 && Number(ub.rows.find((r) => r.user_id === C).balance) === await bal(C, 'CDF')
  ? ok('soldes de plusieurs membres lus par l\'admin')
  : fail('soldes liste', JSON.stringify(ub.rows));
await expectError('soldes des autres interdits aux membres', () => as(C, `select * from admin_users_balances($1)`, [[R3]]), /administrateurs/);

console.log('20. Revenu quotidien automatique et gestion produit');
await db.exec(`update vehicles set daily_revenue_percent = 4, price = 20000, duration_days = 30 where id = '${vehicleId}'`);
const syncCheck = await db.query(`select daily_revenue_cap from vehicles where id = '${vehicleId}'`);
Number(syncCheck.rows[0].daily_revenue_cap) === 800 ? ok('synchronisation : 4 % de 20 000 FC = 800 FC/jour') : fail('sync daily_revenue_cap', syncCheck.rows[0]);

// Avancer la commande active d'un jour pour rendre le premier revenu exigible
await db.exec(`update orders set activated_at = now() - interval '25 hours' where id in (select o.id from orders o join order_items i on i.order_id = o.id where i.vehicle_id = '${vehicleId}')`);
await db.exec(`update order_items set daily_revenue_amount = 800, daily_revenue_percent = 4 where vehicle_id = '${vehicleId}'`);

const beforeAuto = await bal(B, 'CDF');
const creditedCount = (await as(ADMIN, `select credit_due_product_revenues() as n`)).rows[0].n;
const afterAuto = await bal(B, 'CDF');
creditedCount >= 1 && afterAuto - beforeAuto === 800
  ? ok('revenu automatique versé au membre (800 FC crédités au portefeuille)')
  : fail('auto credit', JSON.stringify({ creditedCount, diff: afterAuto - beforeAuto }));

const mine = await as(B, `select * from my_product_revenues()`);
mine.rows.length >= 1 && Number(mine.rows[0].amount) === 800
  ? ok('le membre voit ses versements quotidiens dans my_product_revenues')
  : fail('my_product_revenues', JSON.stringify(mine.rows));

console.log('21. Suppression de produit (politique admin)');
const newVeh = (await as(ADMIN, `insert into vehicles (brand, model, price, duration_days, status, condition, category_id) select 'Test', 'Supprimable', 5000, 10, 'draft', 'used', id from vehicle_categories limit 1 returning id`)).rows[0].id;
await as(C, `delete from vehicles where id = $1`, [newVeh]);
const checkStillExists = (await db.query(`select count(*)::int as n from vehicles where id = '${newVeh}'`)).rows[0].n;
checkStillExists === 1 ? ok('un client ne supprime aucun produit (RLS protège)') : fail('client delete', checkStillExists);
await as(ADMIN, `delete from vehicles where id = $1`, [newVeh]);
const checkGone = (await db.query(`select count(*)::int as n from vehicles where id = '${newVeh}'`)).rows[0].n;
checkGone === 0 ? ok('l\'admin supprime un produit sans commande') : fail('admin delete', checkGone);
await expectError('impossible de supprimer un produit avec commande', () => as(ADMIN, `delete from vehicles where id = $1`, [vehicleId]), /foreign key|violates/);

console.log('22. Cycle de vie des produits');
const D = '00000000-0000-0000-0000-0000000000d1';
await db.exec(`insert into auth.users (id, email) values ('${D}', 'd@test.local')`);
await as(ADMIN, `select admin_wallet_adjustment($1, 5000, 'CDF', 'credit', 'Test cycle de vie des produits')`, [D]);
await approvedDeposit(D);
const lifeVehicles = [];
for (let i = 1; i <= 7; i++) {
  const r = await as(ADMIN, `insert into vehicles (brand, model, price, duration_days, daily_revenue_percent, status, condition, category_id)
    select 'Cycle', 'P${i}', 100, 2, 10, 'published', 'used', id from vehicle_categories limit 1 returning id`);
  lifeVehicles.push(r.rows[0].id);
}
for (let i = 0; i < 6; i++) await as(D, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [lifeVehicles[i]]);
(await db.query(`select active_product_count($1) n`, [D])).rows[0].n === 6 ? ok('6 produits actifs achetés') : fail('6 produits', '');
await expectError('7e produit actif refusé', () => as(D, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [lifeVehicles[6]]), /6 produits actifs/);
await expectError('même produit refusé tant qu\'il est en cours', () => as(D, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [lifeVehicles[0]]), /déjà ce produit en cours/);

const orderOf = async (veh) => (await db.query(`select o.id, o.status, i.duration_days from orders o join order_items i on i.order_id = o.id
  where o.user_id = $1 and i.vehicle_id = $2 order by o.created_at desc limit 1`, [D, veh])).rows[0];
await as(ADMIN, `update vehicles set duration_days = 10 where id = $1`, [lifeVehicles[0]]);
(await orderOf(lifeVehicles[0])).duration_days === 2 ? ok('durée figée à l\'achat : le changement admin ne touche pas les produits achetés') : fail('durée figée', JSON.stringify(await orderOf(lifeVehicles[0])));

const lo1 = await orderOf(lifeVehicles[0]);
await db.query(`update orders set activated_at = now() - interval '49 hours' where id = $1`, [lo1.id]);
const dBefore = await bal(D);
await db.query(`select process_due_product_revenues()`);
(await bal(D)) - dBefore === 20 && (await orderOf(lifeVehicles[0])).status === 'delivered'
  ? ok('versement serveur sans connexion : 2 jours × 10 FC, produit terminé')
  : fail('fin de produit', JSON.stringify({ diff: (await bal(D)) - dBefore, order: await orderOf(lifeVehicles[0]) }));
await expectOk('produit terminé : rachat possible', () => as(D, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [lifeVehicles[0]]));
(await orderOf(lifeVehicles[0])).duration_days === 10 ? ok('le rachat prend la nouvelle durée (10 jours)') : fail('nouvelle durée', JSON.stringify(await orderOf(lifeVehicles[0])));

const lo2 = await orderOf(lifeVehicles[1]);
await db.query(`update orders set activated_at = now() - interval '25 hours' where id = $1`, [lo2.id]);
await db.exec(`update profiles set is_blocked = true, blocked_reason = 'Test' where id = '${D}'`);
const dBlocked = await bal(D);
await db.query(`select process_due_product_revenues()`);
await db.exec(`update profiles set is_blocked = false, blocked_reason = null where id = '${D}'`);
await db.query(`select process_due_product_revenues()`);
const skippedRows = (await db.query(`select count(*)::int n from product_daily_credits where order_id = $1 and skipped`, [lo2.id])).rows[0].n;
(await bal(D)) === dBlocked && skippedRows === 1
  ? ok('compte bloqué : aucun revenu, jour perdu même après déblocage')
  : fail('compte bloqué', JSON.stringify({ diff: (await bal(D)) - dBlocked, skippedRows }));
(await as(D, `select count(*)::int n from my_product_revenues() where order_id = $1`, [lo2.id])).rows[0].n === 0
  ? ok('jour non versé absent de l\'historique du membre')
  : fail('historique', 'jour non versé visible');

// Le numéro de retrait de R1 peut servir à un autre compte
await expectOk('numéro de retrait déjà utilisé par un autre compte accepté', () => as(D, `select set_withdrawal_account('Airtel Money', 'Membre D', '243971111111', '1111')`));

console.log('23. Un numéro de téléphone = un seul compte');
await db.exec(`insert into auth.users (id, email, phone) values ('00000000-0000-0000-0000-0000000000a1', null, '243975550001')`);
await expectError('même numéro pour un 2e compte refusé', () => db.exec(`insert into auth.users (id, email, phone) values ('00000000-0000-0000-0000-0000000000a2', null, '243975550001')`), /unique|duplicate/);
await expectError('même numéro écrit autrement (+2430…) refusé', () => db.exec(`insert into auth.users (id, email, phone) values ('00000000-0000-0000-0000-0000000000a3', null, '2430975550001')`), /Numéro de téléphone invalide/);
await expectError('même numéro dans le profil d\'un autre compte refusé', () => db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a4', 'x@test.local', '{"phone":"243971110002"}')`), /unique|duplicate/);
(await as(D, `select change_withdrawal_password('9999', '2222') v`)).rows[0].v === false
  ? ok('changement refusé avec un mauvais ancien mot de passe')
  : fail('ancien mot de passe', 'accepté');
(await db.query(`select failed_attempts from withdrawal_accounts where user_id = $1`, [D])).rows[0].failed_attempts === 1
  ? ok('l\'essai incorrect est compté')
  : fail('compteur', '');
await expectError('nouveau mot de passe de moins de 4 caractères refusé', () => as(D, `select change_withdrawal_password('1111', '12')`), /4 caractères/);
(await as(D, `select change_withdrawal_password('1111', '2222') v`)).rows[0].v === true
  && (await as(D, `select change_withdrawal_password('2222', '3333') v`)).rows[0].v === true
  ? ok('mot de passe de retrait changé avec l\'ancien')
  : fail('changement mot de passe', '');

console.log('24. Dépôt validé obligatoire');
const E = '00000000-0000-0000-0000-0000000000e2';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${E}', 'e@test.local', '{"referral_code":"${await codeOf(D)}"}')`);
(await as(E, `select i_have_approved_deposit() v`)).rows[0].v === false ? ok('pas de dépôt validé détecté') : fail('i_have_approved_deposit', 'true');
// Achat simulé pour isoler la condition de dépôt sur le retrait
await db.exec(`insert into orders (user_id, status, total_amount, currency, idempotency_key) values ('${E}', 'payment_confirmed', 0, 'CDF', gen_random_uuid())`);
await as(E, `select set_withdrawal_account('Airtel Money', 'Membre E', '243974444444', '1234')`);
await as(ADMIN, `select admin_wallet_adjustment($1, 10000, 'CDF', 'credit', 'Test retrait sans dépôt')`, [E]);
await expectError('retrait refusé sans dépôt validé', () => as(E, `select * from request_withdrawal_with_password(7000, '1234', gen_random_uuid())`), /dépôt validé/);

const dComm = await bal(D);
await db.query(`select grant_referral_commission($1, 1000, 'CDF', 'order', gen_random_uuid())`, [E]);
(await bal(D)) === dComm ? ok('filleul sans dépôt validé : aucune commission pour le parrain') : fail('commission sans dépôt', (await bal(D)) - dComm);
await approvedDeposit(E);
(await as(E, `select i_have_approved_deposit() v`)).rows[0].v === true ? ok('dépôt validé détecté') : fail('i_have_approved_deposit', 'false');
await db.query(`select grant_referral_commission($1, 1000, 'CDF', 'order', gen_random_uuid())`, [E]);
(await bal(D)) - dComm === 250 ? ok('filleul avec dépôt validé : commission de 25 % versée au parrain qui a acheté') : fail('commission avec dépôt', (await bal(D)) - dComm);
await expectOk('retrait accepté avec achat et dépôt validé', () => as(E, `select * from request_withdrawal_with_password(7000, '1234', gen_random_uuid())`));

console.log('25. Bonus surprise');
await expectError('un client ne crée pas de bonus', () => as(B, `select admin_create_gift('Bonus', null, 500, 2)`), /administrateurs/);
const gift = (await as(ADMIN, `select * from admin_create_gift('Bonus réunion', 'Merci d''être venus', 500, 2, now() + interval '1 day')`)).rows[0];
/^[A-Z0-9]{8}$/.test(gift.code) ? ok(`code généré : ${gift.code}`) : fail('code', gift.code);
(await as(B, `select id from gift_codes`)).rows.length === 0 ? ok('les membres ne voient pas les codes') : fail('codes visibles', 'oui');
await expectError('code invalide refusé', () => as(B, `select claim_gift('ZZZZZZZZ')`), /Code invalide/);
await expectError('membre sans achat refusé', () => as(NEW1, `select claim_gift($1)`, [gift.code]), /déjà acheté un produit/);
const bGift = await bal(B);
await expectOk('1er gagnant (code en minuscules accepté)', () => as(B, `select claim_gift($1)`, [gift.code.toLowerCase()]));
(await bal(B)) - bGift === 500 ? ok('500 FC crédités au gagnant') : fail('crédit bonus', (await bal(B)) - bGift);
await expectError('même membre une 2e fois refusé', () => as(B, `select claim_gift($1)`, [gift.code]), /déjà reçu/);
await expectOk('2e gagnant', () => as(C, `select claim_gift($1)`, [gift.code]));
await expectError('3e personne : trop tard', () => as(E, `select claim_gift($1)`, [gift.code]), /tous les bonus ont déjà été distribués/);
const listed = (await as(ADMIN, `select winners from admin_list_gifts() where id = $1`, [gift.id])).rows[0];
listed.winners === 2 ? ok('l\'admin voit 2 gagnants sur 2') : fail('gagnants', JSON.stringify(listed));
(await as(ADMIN, `select * from admin_gift_winners($1)`, [gift.id])).rows.length === 2 ? ok('liste des gagnants') : fail('liste gagnants', '');
(await as(B, `select * from my_gift_claims()`)).rows.length === 1 ? ok('le membre voit son bonus reçu') : fail('my_gift_claims', '');
const gift2 = (await as(ADMIN, `select * from admin_create_gift('Bonus coupé', null, 100, 10)`)).rows[0];
await as(ADMIN, `select admin_set_gift_active($1, false)`, [gift2.id]);
await expectError('bonus désactivé refusé', () => as(E, `select claim_gift($1)`, [gift2.code]), /plus disponible/);
await db.exec(`update gift_codes set is_active = true, expires_at = now() - interval '1 minute' where id = '${gift2.id}'`);
await expectError('bonus expiré refusé', () => as(E, `select claim_gift($1)`, [gift2.code]), /expiré/);

console.log('26. Notifications');
const notif = async (uid, title) => (await db.query(`select count(*)::int n from notifications where user_id = $1 and title = $2`, [uid, title])).rows[0].n;
(await notif(D, 'Achat confirmé')) >= 1 ? ok('achat confirmé notifié') : fail('achat confirmé', 0);
(await notif(D, 'Nouveau membre dans votre équipe')) === 1 ? ok('nouveau filleul notifié au parrain') : fail('nouveau filleul', await notif(D, 'Nouveau membre dans votre équipe'));
(await notif(ADMIN, 'Retrait à traiter')) >= 1 ? ok('admin prévenu d\'un retrait à traiter') : fail('alerte retrait', 0);
(await notif(B, 'Bonus surprise reçu')) === 1 ? ok('bonus reçu notifié') : fail('bonus notifié', 0);
await as(ADMIN, `insert into announcements (title, body, status) values ('Réunion ce soir', 'Rendez-vous à 19 h', 'published')`);
(await notif(E, 'Réunion ce soir')) === 1 && (await notif(B, 'Réunion ce soir')) === 1 ? ok('annonce publiée envoyée à tous les membres') : fail('annonce', '');
await expectOk('appareil enregistré pour les notifications push', () => as(E, `select save_push_subscription('https://push.example/abc', 'cle', 'auth')`));
await expectOk('notification enregistrée même sans fonction push configurée', () => db.query(`select notify_user($1, 'Test push', 'ok', '/compte')`, [E]));
await as(B, `select save_push_subscription('https://push.example/abc', 'cle', 'auth')`);
(await db.query(`select user_id from push_subscriptions where endpoint = 'https://push.example/abc'`)).rows[0].user_id === B
  ? ok('un appareil passe au dernier compte connecté')
  : fail('appareil', '');
(await as(E, `select * from push_subscriptions`).catch(() => ({ rows: [] }))).rows.length === 0
  ? ok('abonnements push illisibles par les membres')
  : fail('abonnements visibles', '');

console.log('27. Super administrateur (invisible)');
await expectError('un client ne nomme pas d\'admin', () => as(B, `select super_admin_set_admin($1, true)`, [B]), /non autorisée/);
await expectOk('le super admin nomme un administrateur', () => as(ADMIN, `select super_admin_set_admin($1, true)`, [R2]));
(await notif(R2, 'Vous êtes administrateur')) === 1 ? ok('le nouvel admin est prévenu') : fail('notif admin', 0);
await expectError('un admin ne nomme pas d\'autre admin', () => as(R2, `select super_admin_set_admin($1, true)`, [B]), /non autorisée/);
await expectError('le rôle du super admin est protégé', () => as(ADMIN, `select super_admin_set_admin($1, false)`, [ADMIN]), /propre rôle/);

const hidden = await as(R2, `select role from user_roles where user_id = $1`, [ADMIN]);
!hidden.rows.some((r) => r.role === 'super_admin') ? ok('un admin ne voit pas le rôle super admin') : fail('rôle visible', JSON.stringify(hidden.rows));
const auditSeen = await as(R2, `select count(*)::int n from audit_logs where entity_type = 'user_roles' or actor_id = $1`, [ADMIN]);
auditSeen.rows[0].n === 0 ? ok('le journal ne montre ni les rôles ni les actions du super admin') : fail('journal', auditSeen.rows[0].n);
await expectError('un admin ne crédite pas le compte du super admin', () => as(R2, `select admin_wallet_adjustment($1, 100, 'CDF', 'credit', 'Test sur un compte protégé')`, [ADMIN]), /Action impossible sur ce compte/);
await expectError('un admin ne bloque pas le compte du super admin', () => as(R2, `select admin_set_user_blocked($1, true, 'Test')`, [ADMIN]), /Action impossible sur ce compte/);
await expectError('un admin ne réinitialise pas son mot de passe', () => as(R2, `select admin_reset_user_password($1, 'abcdef')`, [ADMIN]), /Action impossible sur ce compte/);

const alertsBefore = await notif(ADMIN, '🚨 Alerte : action d\'un admin à vérifier');
const actionsBefore = await notif(ADMIN, 'Action d\'un admin');
await as(R2, `update platform_settings set withdrawal_fee_percent = 7 where id = 1`);
(await db.query(`select withdrawal_fee_percent from platform_settings where id = 1`)).rows[0].withdrawal_fee_percent == 7
  ? ok('un admin peut modifier les frais')
  : fail('frais non modifiés', '');
(await notif(ADMIN, 'Action d\'un admin')) === actionsBefore + 1 ? ok('super admin prévenu du changement des frais') : fail('alerte frais', '');
await expectOk('un admin peut ajouter un compte de dépôt', () => as(R2, `insert into deposit_channels (name, account_number, account_name) values ('Orange Money', '0890000009', 'Test')`));
await as(R2, `select admin_wallet_adjustment($1, 5000, 'CDF', 'credit', 'Crédit sur mon propre compte')`, [R2]);
const alertRow = (await db.query(`select body from notifications where user_id = $1 and title like '🚨%' order by created_at desc limit 1`, [ADMIN])).rows[0];
(await notif(ADMIN, '🚨 Alerte : action d\'un admin à vérifier')) === alertsBefore + 2 && /propre compte/.test(alertRow?.body ?? '')
  ? ok(`super admin alerté (compte de dépôt + crédit sur soi) : « ${alertRow.body} »`)
  : fail('alerte super admin', JSON.stringify({ alertRow, n: await notif(ADMIN, '🚨 Alerte : action d\'un admin à vérifier'), alertsBefore }));
await expectOk('un admin peut modifier les paliers d\'équipe', () => as(R2, `select admin_set_team_reward_tiers('[{"invited_count":1,"amount":500},{"invited_count":2,"amount":1000}]')`));

const quietBefore = await db.query(`select count(*)::int n from notifications where user_id = $1`, [ADMIN]);
await as(ADMIN, `select admin_wallet_adjustment($1, 100, 'CDF', 'credit', 'Action du super admin lui-même')`, [B]);
(await db.query(`select count(*)::int n from notifications where user_id = $1`, [ADMIN])).rows[0].n === quietBefore.rows[0].n
  ? ok('pas d\'alerte pour les actions du super admin lui-même')
  : fail('alerte inutile', '');
await expectOk('le super admin retire le rôle admin', () => as(ADMIN, `select super_admin_set_admin($1, false)`, [R2]));
(await db.query(`select count(*)::int n from user_roles where user_id = $1 and role = 'admin'`, [R2])).rows[0].n === 0 ? ok('rôle admin retiré') : fail('rôle', 'toujours admin');

console.log(failures === 0 ? '\nTOUS LES TESTS SONT PASSÉS' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
