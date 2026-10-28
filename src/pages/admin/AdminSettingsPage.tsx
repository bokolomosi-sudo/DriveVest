import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Alert, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { adminUpdateSettings } from '../../services/content';
import type { PlatformSettings } from '../../types';

const TEXT_KEYS = [
  'default_currency', 'payment_instructions', 'deposit_instructions', 'contact_email', 'contact_phone', 'whatsapp_number',
  'contact_address', 'legal_notice', 'legal_entity_name', 'registration_number', 'regulatory_authority', 'license_number', 'telegram_url', 'whatsapp_group_url',
] as const;
const NUMBER_KEYS = ['min_deposit', 'min_withdrawal', 'withdrawal_fee_percent', 'withdrawal_fee_fixed', 'referral_commission_percent', 'referral_level2_percent', 'referral_level3_percent', 'signup_bonus'] as const;
const BOOL_KEYS = [
  'feature_wallet', 'feature_referral', 'referral_on_orders',
] as const;

type TextKey = (typeof TEXT_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];
type BoolKey = (typeof BOOL_KEYS)[number];
type FormState = Record<TextKey | NumberKey, string> & Record<BoolKey, boolean> & { accepted_payment_methods: string };

function toForm(s: PlatformSettings): FormState {
  const f = { accepted_payment_methods: s.accepted_payment_methods.join('\n') } as FormState;
  for (const k of TEXT_KEYS) f[k] = (s[k] as string | null) ?? '';
  for (const k of NUMBER_KEYS) f[k] = String(s[k] ?? 0);
  for (const k of BOOL_KEYS) f[k] = Boolean(s[k]);
  return f;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="block text-sm font-medium text-slate-900">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}

function Section({ title, children, grid = true }: { title: string; children: ReactNode; grid?: boolean }) {
  return (
    <section className={`card p-5 sm:p-6 ${grid ? 'grid gap-4 sm:grid-cols-2' : 'space-y-4'}`}>
      <h2 className={`text-lg font-semibold ${grid ? 'sm:col-span-2' : ''}`}>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { settings, loading, error, reload } = useSettings();
  const { notify } = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(toForm(settings));
  }, [settings]);

  if (loading || (!form && !error)) return <LoadingState />;
  if (error || !form) return <ErrorState message={error ?? 'Paramètres indisponibles.'} onRetry={reload} />;

  const text = (key: TextKey | NumberKey | 'accepted_payment_methods') => (e: { target: { value: string } }) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));
  const toggle = (key: BoolKey) => (v: boolean) => setForm((f) => (f ? { ...f, [key]: v } : f));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !user) return;
    const currency = form.default_currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return setFormError('Devise invalide (code ISO à 3 lettres).');
    for (const k of ['telegram_url', 'whatsapp_group_url'] as const) {
      if (form[k].trim() && !/^https:\/\//.test(form[k].trim())) return setFormError('Les liens Telegram et WhatsApp doivent commencer par https://');
    }
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) return setFormError('Adresse e-mail invalide.');
    for (const k of NUMBER_KEYS) {
      const v = Number(form[k]);
      if (!Number.isFinite(v) || v < 0) return setFormError('Les montants et pourcentages doivent être positifs.');
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        default_currency: currency,
        accepted_payment_methods: form.accepted_payment_methods.split('\n').map((m) => m.trim()).filter(Boolean),
      };
      for (const k of TEXT_KEYS) if (k !== 'default_currency') payload[k] = form[k].trim() || null;
      for (const k of NUMBER_KEYS) payload[k] = Number(form[k]);
      for (const k of BOOL_KEYS) payload[k] = form[k];
      await adminUpdateSettings(user.id, payload as Parameters<typeof adminUpdateSettings>[1]);
      await reload();
      notify('success', 'Paramètres enregistrés.');
    } catch (err) {
      setFormError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageMeta title="Paramètres — Administration" noindex />
      <PageHeader title="Paramètres de la plateforme" description="Chaque modification est enregistrée dans le journal d'audit." />
      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="Modules" grid={false}>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle label="Portefeuille" hint="Dépôts, retraits, paiement des commandes par solde." checked={form.feature_wallet} onChange={toggle('feature_wallet')} />
            <Toggle label="Parrainage" hint="Codes d'invitation et commissions." checked={form.feature_referral} onChange={toggle('feature_referral')} />
          </div>
        </Section>

        <Section title="Références réglementaires (affichées publiquement)">
          <Field label="Raison sociale de l'exploitant" htmlFor="s-entity"><input id="s-entity" className="input" value={form.legal_entity_name} onChange={text('legal_entity_name')} /></Field>
          <Field label="Numéro d'immatriculation" htmlFor="s-reg"><input id="s-reg" className="input" value={form.registration_number} onChange={text('registration_number')} /></Field>
          <Field label="Autorité de tutelle" htmlFor="s-auth"><input id="s-auth" className="input" value={form.regulatory_authority} onChange={text('regulatory_authority')} /></Field>
          <Field label="Numéro d'agrément / autorisation" htmlFor="s-lic"><input id="s-lic" className="input" value={form.license_number} onChange={text('license_number')} /></Field>
        </Section>

        <Section title="Paiements et portefeuille">
          <Field label="Devise par défaut" htmlFor="s-cur" required><input id="s-cur" className="input uppercase bg-slate-50" maxLength={3} readOnly value={form.default_currency} /></Field>
          <Field label="Moyens de paiement acceptés" htmlFor="s-methods" hint="Un par ligne."><textarea id="s-methods" rows={3} className="input" value={form.accepted_payment_methods} onChange={text('accepted_payment_methods')} /></Field>
          <Field label="Instructions de paiement des commandes" htmlFor="s-instr" className="sm:col-span-2"><textarea id="s-instr" rows={4} className="input" value={form.payment_instructions} onChange={text('payment_instructions')} /></Field>
          <Field label="Instructions de dépôt sur le portefeuille" htmlFor="s-dep" className="sm:col-span-2"><textarea id="s-dep" rows={4} className="input" value={form.deposit_instructions} onChange={text('deposit_instructions')} /></Field>
          <Field label="Dépôt minimum" htmlFor="s-mindep"><input id="s-mindep" type="number" min={0} step="0.01" className="input" value={form.min_deposit} onChange={text('min_deposit')} /></Field>
          <Field label="Retrait minimum" htmlFor="s-minwd"><input id="s-minwd" type="number" min={0} step="0.01" className="input" value={form.min_withdrawal} onChange={text('min_withdrawal')} /></Field>
          <Field label="Frais de retrait (%)" htmlFor="s-feep"><input id="s-feep" type="number" min={0} max={100} step="0.01" className="input" value={form.withdrawal_fee_percent} onChange={text('withdrawal_fee_percent')} /></Field>
          <Field label="Frais de retrait fixes" htmlFor="s-feef"><input id="s-feef" type="number" min={0} step="0.01" className="input" value={form.withdrawal_fee_fixed} onChange={text('withdrawal_fee_fixed')} /></Field>
          <Field label="Bonus d'inscription (FC)" htmlFor="s-bonus" hint="Crédité sur le portefeuille de chaque nouveau compte. Mettez 0 pour le supprimer.">
            <input id="s-bonus" type="number" min={0} step="1" className="input" value={form.signup_bonus} onChange={text('signup_bonus')} />
          </Field>
        </Section>

        <Section title="Parrainage">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Niveau 1 (%)" htmlFor="s-ref" hint="Filleul direct."><input id="s-ref" type="number" min={0} max={100} step="0.01" className="input" value={form.referral_commission_percent} onChange={text('referral_commission_percent')} /></Field>
            <Field label="Niveau 2 (%)" htmlFor="s-ref2" hint="Filleul du filleul."><input id="s-ref2" type="number" min={0} max={100} step="0.01" className="input" value={form.referral_level2_percent} onChange={text('referral_level2_percent')} /></Field>
            <Field label="Niveau 3 (%)" htmlFor="s-ref3" hint="Troisième niveau."><input id="s-ref3" type="number" min={0} max={100} step="0.01" className="input" value={form.referral_level3_percent} onChange={text('referral_level3_percent')} /></Field>
          </div>
          <div className="space-y-2">
            <Toggle label="Sur les achats de véhicules payés" checked={form.referral_on_orders} onChange={toggle('referral_on_orders')} />
          </div>
        </Section>

        <Section title="Coordonnées officielles">
          <Field label="E-mail" htmlFor="s-email"><input id="s-email" type="email" className="input" value={form.contact_email} onChange={text('contact_email')} /></Field>
          <Field label="Téléphone" htmlFor="s-phone"><input id="s-phone" type="tel" className="input" value={form.contact_phone} onChange={text('contact_phone')} /></Field>
          <Field label="Numéro WhatsApp officiel" htmlFor="s-wa" hint="Format international, ex. +243…"><input id="s-wa" type="tel" className="input" value={form.whatsapp_number} onChange={text('whatsapp_number')} /></Field>
          <Field label="Adresse" htmlFor="s-addr"><input id="s-addr" className="input" value={form.contact_address} onChange={text('contact_address')} /></Field>
          <Field label="Lien Telegram du service client" htmlFor="s-tg" hint="https://t.me/…"><input id="s-tg" type="url" className="input" value={form.telegram_url} onChange={text('telegram_url')} /></Field>
          <Field label="Lien du groupe WhatsApp" htmlFor="s-wag" hint="https://chat.whatsapp.com/…"><input id="s-wag" type="url" className="input" value={form.whatsapp_group_url} onChange={text('whatsapp_group_url')} /></Field>
        </Section>

        <Section title="Mentions légales" grid={false}>
          <Field label="Texte de la page Mentions légales" htmlFor="s-legal"><textarea id="s-legal" rows={8} className="input" value={form.legal_notice} onChange={text('legal_notice')} /></Field>
        </Section>

        {formError && <Alert tone="danger">{formError}</Alert>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer les paramètres</button>
      </form>
    </>
  );
}
