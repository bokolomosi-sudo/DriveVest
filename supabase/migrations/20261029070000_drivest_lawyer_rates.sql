-- Taux révisés sur conseil de l'avocat : parrainage 5 % / 2 % / 1 %, frais de retrait 5 %.
-- (Toujours modifiables ensuite par l'administration dans Paramètres.)
update public.platform_settings
  set referral_commission_percent = 5,
      referral_level2_percent = 2,
      referral_level3_percent = 1,
      withdrawal_fee_percent = 5,
      withdrawal_fee_fixed = 0
  where id = 1;
