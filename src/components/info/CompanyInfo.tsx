import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { formatLocalPhone } from '../../lib/phoneAuth';

/** Information pas encore fournie : affichée telle quelle, bien visible, jamais inventée. */
export function Missing({ children }: { children: ReactNode }) {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">[À compléter : {children}]</span>;
}

/**
 * Identité de l'entreprise, lue dans Administration > Paramètres.
 * Un champ vide s'affiche comme « À compléter ».
 */
export function useCompanyInfo() {
  const { settings } = useSettings();
  const value = (v: string | null | undefined, label: string): ReactNode => (v?.trim() ? v.trim() : <Missing>{label}</Missing>);
  const email = settings?.contact_email?.trim();
  return {
    name: value(settings?.legal_entity_name, 'raison sociale'),
    address: value(settings?.contact_address, 'adresse du siège'),
    registration: value(settings?.registration_number, "numéro d'immatriculation (RCCM / Id. nat.)"),
    phone: settings?.contact_phone?.trim() ? formatLocalPhone(settings.contact_phone.trim()) : <Missing>téléphone de contact</Missing>,
    email: email ? <a href={`mailto:${email}`} className="font-medium text-accent-700 underline">{email}</a> : <Missing>e-mail de contact</Missing>,
    support: (
      <Link to="/service-client" className="font-medium text-accent-700 underline">
        service client
      </Link>
    ),
  };
}
