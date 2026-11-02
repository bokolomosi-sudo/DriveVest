import { Link } from 'react-router-dom';
import { ChevronDown, Headphones, Mail, MapPin, Phone } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';
import { useCompanyInfo } from '../../components/info/CompanyInfo';
import { useSettings } from '../../context/SettingsContext';
import { CURRENCY, formatPrice } from '../../lib/format';

export default function FaqPage() {
  const { settings } = useSettings();
  const c = useCompanyInfo();
  const minDeposit = Number(settings?.min_deposit ?? 0);
  const minWithdrawal = Number(settings?.min_withdrawal ?? 0);

  const faq: { q: string; a: string; link?: { to: string; label: string } }[] = [
    { q: 'Comment créer un compte ?', a: 'Avec votre numéro de téléphone de la RDC et un mot de passe, puis votre nom, province et ville. Un numéro = un compte.', link: { to: '/guide/creer-un-compte', label: 'Voir le guide' } },
    { q: "J'ai oublié mon mot de passe.", a: 'Contactez le service client depuis le numéro de téléphone de votre compte : il réinitialisera votre mot de passe.' },
    {
      q: 'Pourquoi mon dépôt est « En attente » ?',
      a: `Il est crédité dès que le paiement reçu correspond au montant et à la référence déclarés. Vérifiez la référence recopiée depuis le SMS.${minDeposit > 0 ? ` Dépôt minimum : ${formatPrice(minDeposit, CURRENCY)}.` : ''}`,
      link: { to: '/guide/faire-un-depot', label: 'Voir le guide' },
    },
    { q: 'Puis-je acheter un produit sans dépôt ?', a: "Non : au moins un dépôt validé est obligatoire pour acheter. Le bonus d'inscription, les commissions et les bonus ne comptent pas comme dépôt." },
    {
      q: 'Quand puis-je retirer ?',
      a: `Après au moins un dépôt validé et l'achat d'au moins un produit, avec un compte de retrait configuré.${minWithdrawal > 0 ? ` Retrait minimum : ${formatPrice(minWithdrawal, CURRENCY)}.` : ''} Les frais sont affichés avant confirmation.`,
      link: { to: '/guide/faire-un-retrait', label: 'Voir le guide' },
    },
    { q: 'Comment changer mon numéro de retrait ?', a: 'Le compte de retrait ne peut être modifié que par le service client, pour protéger vos gains.' },
    { q: "Pourquoi je n'ai pas reçu de commission ?", a: "Vous devez avoir acheté un produit vous-même, et votre invité doit avoir fait un dépôt validé puis acheté un produit. L'inscription seule n'est pas rémunérée.", link: { to: '/guide/parrainage', label: 'Voir le guide' } },
    { q: 'Comment recevoir un bonus surprise ?', a: "Entrez le code partagé dans le groupe dans « Bonus surprise ». Réservé aux membres ayant acheté un produit ; seuls les premiers gagnent." },
    { q: 'Je ne reçois pas les notifications.', a: 'Activez-les depuis le tableau de bord ou la page Notifications, puis autorisez-les dans les réglages du téléphone.' },
  ];

  return (
    <div className="container-page max-w-3xl py-6 sm:py-10">
      <PageMeta title="FAQ et contact" description="Questions fréquentes sur Drivest et coordonnées du service client." />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions fréquentes</h1>

      <div className="mt-6 space-y-2">
        {faq.map((item) => (
          <details key={item.q} className="group card p-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-slate-900">
              {item.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600">
              <p>{item.a}</p>
              {item.link && <Link to={item.link.to} className="mt-2 inline-block font-medium text-accent-700 underline">{item.link.label}</Link>}
            </div>
          </details>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-xl font-bold tracking-tight">Nous contacter</h2>
        <ul className="card mt-4 divide-y divide-slate-100 text-sm">
          <li className="flex items-center gap-3 p-4"><Headphones className="h-5 w-5 shrink-0 text-accent-600" /> <span>Service client (WhatsApp ou demande écrite) : <Link to="/service-client" className="font-medium text-accent-700 underline">ouvrir</Link></span></li>
          <li className="flex items-center gap-3 p-4"><Mail className="h-5 w-5 shrink-0 text-accent-600" /> <span>{c.email}</span></li>
          <li className="flex items-center gap-3 p-4"><Phone className="h-5 w-5 shrink-0 text-accent-600" /> <span>{c.phone}</span></li>
          <li className="flex items-center gap-3 p-4"><MapPin className="h-5 w-5 shrink-0 text-accent-600" /> <span>{c.address}</span></li>
        </ul>
      </section>
    </div>
  );
}
