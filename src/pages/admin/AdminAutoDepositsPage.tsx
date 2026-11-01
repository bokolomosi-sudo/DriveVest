import { useEffect, useState } from 'react';
import { Copy, MessageSquareText, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';
import { Badge } from '../../components/ui/Badge';
import { Alert, EmptyState, ErrorState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { toErrorMessage } from '../../lib/errors';
import { CURRENCY, formatDate, formatPrice } from '../../lib/format';
import { formatLocalPhone } from '../../lib/phoneAuth';
import type { Tone } from '../../lib/labels';
import {
  getAutoDepositSettings,
  listIncomingSms,
  regenerateSmsToken,
  smsWebhookUrl,
  updateAutoDepositSettings,
  type IncomingSmsStatus,
} from '../../services/autoDeposits';

const STATUS: Record<IncomingSmsStatus, { label: string; tone: Tone }> = {
  matched: { label: 'Dépôt validé', tone: 'success' },
  unmatched: { label: 'En attente de déclaration', tone: 'info' },
  amount_mismatch: { label: 'Montant différent', tone: 'warning' },
  ignored_sender: { label: 'Expéditeur ignoré', tone: 'neutral' },
};

/** Dépôts automatiques : configuration de « SMS Forwarder » et SMS reçus. */
export default function AdminAutoDepositsPage() {
  const { notify } = useToast();
  const settings = useAsync(getAutoDepositSettings, []);
  const sms = useAsync(listIncomingSms, []);
  const [enabled, setEnabled] = useState(true);
  const [senders, setSenders] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.enabled);
      setSenders(settings.data.allowed_senders.join('\n'));
    }
  }, [settings.data]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', `${label} copié.`);
    } catch {
      notify('error', 'Copie impossible : sélectionnez le texte manuellement.');
    }
  };

  const save = async () => {
    const list = [...new Set(senders.split('\n').map((s) => s.trim()).filter(Boolean))];
    if (list.length === 0) return notify('error', 'Indiquez au moins un expéditeur autorisé.');
    setBusy(true);
    try {
      await updateAutoDepositSettings({ enabled, allowed_senders: list });
      notify('success', 'Réglages enregistrés.');
      await settings.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!window.confirm('Créer une nouvelle adresse ? L’ancienne cessera de fonctionner : il faudra la remplacer dans SMS Forwarder.')) return;
    setBusy(true);
    try {
      await regenerateSmsToken();
      notify('success', 'Nouvelle adresse créée. Mettez-la à jour dans SMS Forwarder.');
      await settings.reload();
    } catch (err) {
      notify('error', toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const url = settings.data ? smsWebhookUrl(settings.data.webhook_token) : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageMeta title="Dépôts automatiques — Administration" noindex />
      <PageHeader
        title="Dépôts automatiques"
        description="Le téléphone qui reçoit les paiements transfère les SMS Mobile Money : un dépôt est validé tout seul quand l’ID de transaction et le montant correspondent."
      />

      {settings.loading ? <LoadingState /> : settings.error ? <ErrorState message={settings.error} onRetry={settings.reload} /> : settings.data && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Configuration de SMS Forwarder</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Installez <strong>SMS Forwarder</strong> sur le téléphone qui reçoit les paiements (le numéro du compte de dépôt).</li>
            <li>Ajoutez une règle <strong>Webhook</strong> : <em>Sender</em> = <code>436</code> (le numéro qui envoie les SMS Airtel Money) ; les autres SMS ne sont pas transférés.</li>
            <li>Dans <em>Webhook URL</em>, collez l’adresse ci-dessous. Gardez le modèle JSON proposé par défaut.</li>
            <li>Activez <em>Store failed messages for retry</em>, puis touchez <strong>TEST</strong> et <strong>ADD</strong>.</li>
          </ol>
          <Field label="Adresse du webhook (à garder secrète)" htmlFor="ad-url">
            <div className="flex gap-2">
              <input id="ad-url" readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-secondary shrink-0" onClick={() => copy(url, 'Adresse')}><Copy className="h-4 w-4" /> Copier</button>
            </div>
          </Field>
          <Alert tone="warning">Cette adresse permet d’envoyer des SMS au site : ne la partagez avec personne. En cas de doute, créez-en une nouvelle.</Alert>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm"><span className="block font-medium text-slate-900">Validation automatique activée</span><span className="text-slate-500">Désactivée, les SMS sont enregistrés mais les dépôts attendent votre validation manuelle.</span></span>
          </label>
          <Field label="Expéditeurs autorisés (un par ligne)" htmlFor="ad-senders" hint="Nom ou numéro exact qui envoie le SMS de paiement (ex. 436 pour Airtel Money). Les SMS des autres expéditeurs sont ignorés : un faux SMS envoyé depuis un téléphone ne crédite rien.">
            <textarea id="ad-senders" rows={3} className="input font-mono" value={senders} onChange={(e) => setSenders(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4" />} Enregistrer</button>
            <button type="button" className="btn-secondary" onClick={regenerate} disabled={busy}><RefreshCw className="h-4 w-4" /> Nouvelle adresse</button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">SMS reçus</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={sms.reload}><RefreshCw className="h-3.5 w-3.5" /> Actualiser</button>
        </div>
        {sms.loading ? <LoadingState /> : sms.error ? <ErrorState message={sms.error} onRetry={sms.reload} /> : !sms.data?.length ? (
          <EmptyState icon={<MessageSquareText className="h-10 w-10" />} title="Aucun SMS reçu pour l’instant" description="Touchez TEST dans SMS Forwarder pour vérifier la connexion." />
        ) : (
          <ul className="space-y-2">
            {sms.data.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{m.sender}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                    <span className="text-xs text-slate-500">{formatDate(m.received_at, true)}</span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-700">{m.body}</p>
                {m.status === 'matched' && m.transaction && (
                  <p className="mt-2 text-xs font-medium text-accent-700">
                    {formatPrice(Number(m.transaction.amount), CURRENCY)} crédités à {m.transaction.profile?.full_name || formatLocalPhone(m.transaction.profile?.phone)}
                  </p>
                )}
                {m.note && <p className="mt-2 text-xs font-medium text-amber-700">{m.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
