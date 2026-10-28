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
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
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

console.log('2. Inscription (trigger profil + rôle)');
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ADMIN}', 'admin@test.local', '{"full_name":"Admin Test"}'),
  ('${CLIENT}', 'client@test.local', '{"full_name":"Client Test","phone":"+000"}'),
  ('${OTHER}', 'other@test.local', '{}');`);
const prof = await db.query(`select count(*)::int n from profiles`);
prof.rows[0].n === 3 ? ok('3 profils créés') : fail('profils', JSON.stringify(prof.rows));
await db.exec(`insert into user_roles (user_id, role) values ('${ADMIN}', 'admin')`);

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
  `insert into vehicles (category_id, brand, model, year, price, currency, condition, status) values ($1, 'Toyota', 'Corolla', 2022, 15000, 'CDF', 'used', 'published') returning id, published_at`, [cat.rows[0].id]));
const vehicleId = v.rows[0].id;
v.rows[0].published_at ? ok('published_at renseigné automatiquement') : fail('published_at', 'null');
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
await expectError('deuxième commande active sur le même véhicule refusée', () => as(CLIENT, `select create_order($1, gen_random_uuid())`, [vehicleId]), /déjà une commande/);
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
await expectError('demande de remboursement refusée', () => as(CLIENT, `select request_refund($1, 'Changement de projet')`, [orderId]), /permission denied/);
await expectError('traitement de remboursement refusé', () => as(ADMIN, `select admin_process_refund(gen_random_uuid(), 'approved')`), /permission denied/);
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

await expectError('retrait sans portefeuille configuré refusé', () => as(INV, `select request_withdrawal_with_password(100, '1234', gen_random_uuid())`), /Configurez/);
await expectError('ancien retrait sans mot de passe bloqué', () => as(INV, `select request_withdrawal(100, 'CDF', 'Mobile', '+000111', gen_random_uuid())`), /permission denied/);
await expectError('numéro Airtel invalide refusé', () => as(INV, `select set_withdrawal_account('Jean', '12345', '1234')`), /invalide/);
await expectOk('portefeuille de retrait configuré', () => as(INV, `select set_withdrawal_account('Jean Investisseur', '243971234567', '1234')`));
await expectError('reconfiguration refusée', () => as(INV, `select set_withdrawal_account('Autre', '243971234567', '9999')`), /déjà configuré/);
await expectError('mot de passe haché illisible', () => as(INV, `select * from withdrawal_accounts`), /permission denied/);
const acc = await as(INV, `select * from get_my_withdrawal_account()`);
acc.rows[0]?.airtel_number === '243971234567' ? ok('portefeuille de retrait lisible par son titulaire') : fail('portefeuille', JSON.stringify(acc.rows));
const bad = await as(INV, `select (request_withdrawal_with_password(100, '0000', gen_random_uuid())).id`);
bad.rows[0].id === null && (await bal(INV)) === 1000 ? ok('mauvais mot de passe : aucun retrait créé') : fail('mot de passe', JSON.stringify(bad.rows));
const w1 = await as(INV, `select * from request_withdrawal_with_password(100, '1234', gen_random_uuid())`);
w1.rows[0].status === 'pending' && w1.rows[0].method === 'Airtel Money' ? ok('retrait en traitement bancaire') : fail('retrait', JSON.stringify(w1.rows[0]));
(await bal(INV)) === 898 ? ok('retrait 100 + frais 2 bloqués → disponible 898') : fail('retrait', await bal(INV));
await expectError('refus sans motif impossible', () => as(ADMIN, `select admin_process_withdrawal($1, false)`, [w1.rows[0].id]), /motif/);
await as(ADMIN, `select admin_process_withdrawal($1, false, 'Numéro Airtel injoignable')`, [w1.rows[0].id]);
const r1 = await db.query(`select status, rejection_reason from transactions where id = $1`, [w1.rows[0].id]);
r1.rows[0].status === 'rejected' && (await bal(INV)) === 1000 ? ok('retrait refusé avec motif → fonds libérés') : fail('refus', JSON.stringify(r1.rows));
await expectError('retrait supérieur au solde refusé', () => as(INV, `select request_withdrawal_with_password(995, '1234', gen_random_uuid())`), /insuffisant/);
const w2 = await as(INV, `select * from request_withdrawal_with_password(100, '1234', gen_random_uuid())`);
await as(ADMIN, `select admin_process_withdrawal($1, true)`, [w2.rows[0].id]);
const r2 = await db.query(`select status from transactions where id = $1`, [w2.rows[0].id]);
r2.rows[0].status === 'confirmed' && (await bal(INV)) === 898 ? ok('retrait confirmé sans référence → disponible 898') : fail('confirmation', JSON.stringify(r2.rows));
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
await expectError('participation refusée', () => as(INV, `select invest(gen_random_uuid(), 300, true, gen_random_uuid())`), /permission denied/);

console.log('12. Paiement de commande par portefeuille');
const o3 = await as(INV, `select * from create_order($1, gen_random_uuid())`, [vehicleId]);
await expectError('solde insuffisant refusé', () => as(INV, `select pay_order_with_wallet($1)`, [o3.rows[0].id]), /insuffisant/);
await expectError('ajustement sans motif refusé', () => as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'x')`, [INV]), /motif/);
await as(ADMIN, `select admin_wallet_adjustment($1, 20000, 'CDF', 'credit', 'Apport validé par la direction, pièce n°42')`, [INV]);
await as(INV, `select pay_order_with_wallet($1)`, [o3.rows[0].id]);
const st4 = await db.query(`select status from orders where id = $1`, [o3.rows[0].id]);
st4.rows[0].status === 'payment_confirmed' && (await bal(INV)) === 5898 ? ok('commande payée depuis le portefeuille') : fail('paiement portefeuille', st4.rows[0].status + ' ' + await bal(INV));
(await bal(OTHER)) === 750 ? ok('commission de 5 % sur la commande : +750') : fail('commission commande', await bal(OTHER));
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
await expectOk('le filleul achète avec son portefeuille', () => as(B, `select * from buy_vehicle_with_wallet($1, gen_random_uuid())`, [vehicleId]));
const lv = [await bal(R3, 'CDF'), await bal(R2, 'CDF'), await bal(R1, 'CDF')];
lv[0] === 3750 && lv[1] === 750 && lv[2] === 150
  ? ok('commissions 25 % / 5 % / 1 % sur 15 000 CDF : 3 750 / 750 / 150')
  : fail('3 niveaux', JSON.stringify(lv));
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

console.log(failures === 0 ? '\nTOUS LES TESTS SONT PASSÉS' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
