import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Spinner } from '../ui/Feedback';
import { Field } from '../ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../lib/errors';
import { adminUpdateSettings } from '../../services/content';
import { SuperAdminLock } from './SuperAdminLock';

/** Ce que les membres voient sur la page Service client : nom WhatsApp, numéro, horaires, groupe. */
export function SupportContactCard() {
  const { user } = useAuth();
  const { settings, reload } = useSettings();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [hours, setHours] = useState('');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setName(settings.support_name ?? '');
    setNumber(settings.whatsapp_number ?? '');
    setHours(settings.support_hours ?? '');
    setGroup(settings.whatsapp_group_url ?? '');
  }, [settings]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !user) return;
    setError(null);
    const digits = number.replace(/[^\d]/g, '');
    if (number.trim() && !/^0\d{9}$/.test(digits) && !/^243\d{9}$/.test(digits)) {
      return setError('Numéro WhatsApp invalide : 10 chiffres commençant par 0 (ex. 0971234567).');
    }
    if (group.trim() && !/^https:\/\/chat\.whatsapp\.com\//.test(group.trim())) {
      return setError('Le lien du groupe doit commencer par https://chat.whatsapp.com/');
    }
    setBusy(true);
    try {
      await adminUpdateSettings(user.id, {
        support_name: name.trim() || null,
        whatsapp_number: number.trim() || null,
        support_hours: hours.trim() || null,
        whatsapp_group_url: group.trim() || null,
      });
      await reload();
      notify('success', 'Service client mis à jour.');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SuperAdminLock>
    <form onSubmit={save} className="mb-6 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div>
        <h2 className="text-lg font-semibold">Coordonnées du service client</h2>
        <p className="text-sm text-slate-500">Affichées aux membres sur la page Service client.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom sur WhatsApp" htmlFor="sc-name" hint="Ex. : Service client Drivest">
          <input id="sc-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Numéro WhatsApp" htmlFor="sc-number" hint="10 chiffres commençant par 0">
          <input id="sc-number" type="tel" inputMode="tel" className="input font-mono" placeholder="0971234567" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Horaires" htmlFor="sc-hours" hint="Ex. : Lundi à samedi, 8 h – 20 h" className="sm:col-span-2">
          <input id="sc-hours" className="input" maxLength={160} value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Lien du groupe WhatsApp" htmlFor="sc-group" hint="Dans WhatsApp : infos du groupe → Inviter via un lien → Copier" className="sm:col-span-2">
          <input id="sc-group" type="url" className="input" placeholder="https://chat.whatsapp.com/…" value={group} onChange={(e) => setGroup(e.target.value)} />
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn bg-accent-700 text-white hover:bg-accent-800" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />} Enregistrer
      </button>
    </form>
    </SuperAdminLock>
  );
}
