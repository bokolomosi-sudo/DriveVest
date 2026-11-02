-- =============================================================================
-- Référence de dépôt déjà utilisée : refusée même si elle est un peu modifiée
--  * comparaison sans tenir compte des majuscules, espaces et ponctuation
--  * lettres qui ressemblent à des chiffres : O = 0, I = 1, L = 1
--    (ex. « MP24O9.1234 » est refusée si « mp2409 1234 » a déjà été déclarée)
--  * vérifiée quel que soit le moyen de paiement choisi
--  * une référence dont le dépôt a été refusé peut toujours être redéclarée
-- =============================================================================

create or replace function public.deposit_reference_key(p_value text)
returns text language sql immutable set search_path = public as $$
  select translate(regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g'), 'OIL', '011');
$$;

create or replace function public.request_deposit(
  p_amount numeric, p_currency text, p_method text, p_reference text,
  p_proof_path text, p_idempotency_key uuid
)
returns public.transactions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_active_user();
  v_settings public.platform_settings;
  v_tx public.transactions;
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_key text := public.deposit_reference_key(p_reference);
begin
  perform public.assert_feature('wallet');
  if p_idempotency_key is null then
    raise exception 'Requête invalide.' using errcode = '22023';
  end if;
  select * into v_tx from public.transactions where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_tx;
  end if;

  select * into v_settings from public.platform_settings where id = 1;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount < v_settings.min_deposit then
    raise exception 'Montant invalide (minimum : % %).', v_settings.min_deposit, v_currency using errcode = 'P0001';
  end if;
  if coalesce(trim(p_method), '') = '' or char_length(v_key) < 3 then
    raise exception 'Le moyen de paiement et la référence de transaction sont obligatoires.' using errcode = 'P0001';
  end if;
  if p_proof_path is not null and p_proof_path not like v_uid::text || '/%' then
    raise exception 'Justificatif invalide.' using errcode = 'P0001';
  end if;

  -- Deux déclarations simultanées de la même référence : la seconde attend la première
  perform pg_advisory_xact_lock(hashtext('deposit_reference:' || v_key));
  if exists (
    select 1 from public.transactions
    where type = 'deposit' and status <> 'rejected'
      and public.deposit_reference_key(external_reference) = v_key
  ) then
    raise exception 'Cette référence de paiement a déjà été déclarée.' using errcode = 'P0001';
  end if;

  begin
    insert into public.transactions (user_id, type, amount, currency, status, reference, reason, wallet, direction,
                                     method, external_reference, proof_path, idempotency_key)
    values (v_uid, 'deposit', p_amount, v_currency, 'pending', public.new_transaction_reference(),
            'Dépôt sur le portefeuille', true, 'credit', trim(p_method), trim(p_reference), p_proof_path, p_idempotency_key)
    returning * into v_tx;
  exception when unique_violation then
    raise exception 'Cette référence de paiement a déjà été déclarée.' using errcode = 'P0001';
  end;
  return v_tx;
end;
$$;

-- Recherche rapide des références déjà déclarées
create index if not exists transactions_deposit_reference_key_idx
  on public.transactions (public.deposit_reference_key(external_reference))
  where type = 'deposit' and status <> 'rejected';
