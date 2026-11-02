import type { ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Building2, Gift, Share2, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { MockupName } from '../../components/info/GuideMockups';
import { Missing } from '../../components/info/CompanyInfo';
import { CURRENCY, formatPrice } from '../../lib/format';
import type { PlatformSettings } from '../../types';

export interface GuideStep {
  title: string;
  body: ReactNode;
  mockup?: MockupName;
  /** Élément numéroté et entouré sur l'illustration */
  focus?: number;
}

export interface GuideTopic {
  slug: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  intro: ReactNode;
  steps: GuideStep[];
  /** Règles à retenir, affichées après les étapes */
  rules?: ReactNode[];
}

const money = (v: number | undefined | null) => formatPrice(Number(v ?? 0), CURRENCY);

/**
 * Contenu du guide, basé sur les vrais écrans et règles de l'application
 * (fonctions SQL : dépôt validé obligatoire, un numéro = un compte, etc.).
 * Les montants et taux viennent des paramètres de la plateforme.
 */
export function guideTopics(s: PlatformSettings | null): GuideTopic[] {
  const minDeposit = Number(s?.min_deposit ?? 0);
  const minWithdrawal = Number(s?.min_withdrawal ?? 0);
  const feePercent = Number(s?.withdrawal_fee_percent ?? 0);
  const feeFixed = Number(s?.withdrawal_fee_fixed ?? 0);
  const signupBonus = Number(s?.signup_bonus ?? 0);
  const rates = [s?.referral_commission_percent, s?.referral_level2_percent, s?.referral_level3_percent].map((r) => Number(r ?? 0));
  const ratesKnown = rates.some((r) => r > 0);

  return [
    {
      slug: 'creer-un-compte',
      title: 'Créer un compte',
      summary: 'Inscription avec votre numéro de téléphone, puis vos informations.',
      icon: UserPlus,
      intro: (
        <p>
          L'inscription se fait uniquement avec un numéro de téléphone de la RDC et un mot de passe. Aucun e-mail ni
          pièce d'identité n'est demandé.
        </p>
      ),
      steps: [
        {
          title: 'Saisissez votre numéro de téléphone',
          body: (
            <p>
              Ouvrez la page <strong>Créer un compte</strong> et entrez votre numéro à 10 chiffres commençant par 0
              (par exemple 0971234567). L'indicatif +243 est ajouté automatiquement.
            </p>
          ),
          mockup: 'register',
          focus: 1,
        },
        {
          title: 'Choisissez un mot de passe',
          body: <p>Au moins 6 caractères, saisis deux fois à l'identique. Gardez-le pour vous : il protège votre solde.</p>,
          mockup: 'register',
          focus: 2,
        },
        {
          title: 'Validez avec « Créer mon compte »',
          body: (
            <p>
              Si vous avez été invité, ouvrez le lien de votre parrain : son code est alors rempli tout seul dans le
              formulaire.{signupBonus > 0 && <> Un bonus d'inscription de {money(signupBonus)} est crédité sur votre compte.</>}
            </p>
          ),
          mockup: 'register',
          focus: 3,
        },
        {
          title: 'Connectez-vous',
          body: <p>Vous êtes redirigé vers la connexion : votre numéro est déjà rempli, entrez votre mot de passe.</p>,
          mockup: 'login',
          focus: 1,
        },
        {
          title: 'Complétez vos informations',
          body: <p>À la première connexion, indiquez votre nom complet, votre province et votre ville, puis « Continuer ». Vous arrivez sur votre espace.</p>,
          mockup: 'welcome',
          focus: 1,
        },
      ],
      rules: [
        'Un numéro de téléphone = un seul compte. Un numéro déjà inscrit ne peut pas créer un deuxième compte.',
        'Mot de passe oublié : contactez le service client depuis le numéro de votre compte pour le réinitialiser.',
        'Vous pouvez installer l’application Drivest sur votre téléphone Android pour un accès plus rapide.',
      ],
    },
    {
      slug: 'faire-un-depot',
      title: 'Faire un dépôt',
      summary: 'Recharger votre compte par Mobile Money.',
      icon: ArrowDownToLine,
      intro: (
        <p>
          Le dépôt alimente votre solde Drivest. Il est <strong>obligatoire</strong> : sans au moins un dépôt validé, vous
          ne pouvez ni acheter un produit, ni retirer, et votre parrain ne reçoit pas de commission sur vos achats.
        </p>
      ),
      steps: [
        {
          title: 'Ouvrez l’onglet « Dépôt » et choisissez le moyen de paiement',
          body: <p>Les comptes de dépôt affichés sont ceux de Drivest, définis par l'administration.</p>,
          mockup: 'deposit',
          focus: 1,
        },
        {
          title: 'Indiquez le montant',
          body: <p>{minDeposit > 0 ? <>Le dépôt minimum est de {money(minDeposit)}.</> : 'Saisissez le montant que vous allez envoyer.'}</p>,
          mockup: 'deposit',
          focus: 2,
        },
        {
          title: 'Envoyez l’argent depuis votre téléphone',
          body: (
            <p>
              Copiez le numéro du compte Drivest affiché, puis faites le transfert Mobile Money de ce montant exact.
              Vous recevez un SMS de confirmation de votre opérateur.
            </p>
          ),
          mockup: 'deposit',
          focus: 3,
        },
        {
          title: 'Recopiez la référence du SMS',
          body: <p>Entrez l'identifiant de la transaction indiqué dans le SMS de votre opérateur (une même référence ne peut être utilisée qu'une fois).</p>,
          mockup: 'deposit',
          focus: 4,
        },
        {
          title: 'Confirmez le dépôt',
          body: <p>Appuyez sur « Confirmer le dépôt ». Votre dépôt apparaît « En attente » dans « Mes dépôts ».</p>,
          mockup: 'deposit',
          focus: 5,
        },
        {
          title: 'Attendez la validation',
          body: (
            <p>
              Lorsque la référence et le montant correspondent au paiement reçu, le dépôt est validé (automatiquement pour
              Airtel Money, ou par l'administration). Le solde est crédité et vous recevez une notification.
            </p>
          ),
          mockup: 'deposit-history',
          focus: 1,
        },
      ],
      rules: [
        'Envoyez exactement le montant déclaré : un montant différent n’est pas validé automatiquement.',
        'Le bonus d’inscription, les commissions et les bonus surprise ne comptent pas comme dépôt.',
        'Avec votre solde, achetez un produit depuis la page Produits (6 produits actifs au maximum).',
      ],
    },
    {
      slug: 'faire-un-retrait',
      title: 'Faire un retrait',
      summary: 'Recevoir vos gains sur votre Mobile Money.',
      icon: ArrowUpFromLine,
      intro: <p>Le retrait envoie votre solde disponible vers le compte Mobile Money que vous avez enregistré.</p>,
      steps: [
        {
          title: 'Configurez votre portefeuille de paiement (une seule fois)',
          body: <p>Au premier retrait, choisissez votre réseau dans l'onglet « Retrait ».</p>,
          mockup: 'withdrawal-setup',
          focus: 1,
        },
        {
          title: 'Indiquez le titulaire et le numéro',
          body: <p>Nom du titulaire du compte Mobile Money et numéro à 10 chiffres commençant par 0.</p>,
          mockup: 'withdrawal-setup',
          focus: 2,
        },
        {
          title: 'Créez votre mot de passe de retrait',
          body: <p>4 caractères minimum. Il vous sera demandé à chaque retrait ; vous pouvez le changer dans « Sécurité ».</p>,
          mockup: 'withdrawal-setup',
          focus: 3,
        },
        {
          title: 'Vérifiez les conditions',
          body: <p>Les conditions remplies sont cochées en vert : dépôt validé, produit acheté, portefeuille configuré.</p>,
          mockup: 'withdrawal',
          focus: 1,
        },
        {
          title: 'Saisissez le montant',
          body: (
            <p>
              {minWithdrawal > 0 && <>Minimum {money(minWithdrawal)}. </>}
              {feePercent > 0 || feeFixed > 0 ? (
                <>
                  Des frais de {[feePercent > 0 && `${feePercent} %`, feeFixed > 0 && money(feeFixed)].filter(Boolean).join(' + ')} sont
                  déduits : le montant reçu est affiché avant confirmation.
                </>
              ) : (
                'Le montant reçu est affiché avant confirmation.'
              )}
            </p>
          ),
          mockup: 'withdrawal',
          focus: 2,
        },
        {
          title: 'Confirmez avec votre mot de passe de retrait',
          body: <p>Le montant est bloqué sur votre solde dès la demande, puis envoyé par l'administration. Vous êtes prévenu par notification.</p>,
          mockup: 'withdrawal',
          focus: 4,
        },
      ],
      rules: [
        'Pour retirer, il faut au moins un dépôt validé ET au moins un produit acheté.',
        'Un retrait soumis est définitif.',
        'Le compte de retrait ne se modifie pas seul : contactez le service client pour le changer.',
      ],
    },
    {
      slug: 'parrainage',
      title: 'Fonctionnement du parrainage',
      summary: 'Commissions sur 3 niveaux et récompenses d’équipe.',
      icon: Users,
      intro: (
        <p>
          Chaque membre a un code et un lien d'invitation. Les personnes inscrites avec votre lien forment votre équipe
          (page « Mon équipe »), sur trois niveaux.
        </p>
      ),
      steps: [
        {
          title: 'Votre équipe sur 3 niveaux',
          body: (
            <p>
              Niveau 1 : vos invités directs. Niveau 2 : les invités de vos invités. Niveau 3 : le niveau suivant.
            </p>
          ),
          mockup: 'referral',
          focus: 3,
        },
        {
          title: 'Une commission sur leurs achats',
          body: (
            <p>
              Quand un membre de votre équipe achète un produit, vous recevez un pourcentage du montant
              {ratesKnown ? <> : {rates[0]} % (niveau 1), {rates[1]} % (niveau 2) et {rates[2]} % (niveau 3)</> : ' (taux affichés dans « Mon équipe »)'}.
              La commission est créditée sur votre solde.
            </p>
          ),
          mockup: 'referral',
          focus: 3,
        },
        {
          title: 'Des récompenses d’équipe',
          body: <p>Des primes sont versées automatiquement quand un nombre donné d'invités directs ont acheté au moins un produit. La barre montre votre progression.</p>,
          mockup: 'referral',
          focus: 4,
        },
      ],
      rules: [
        'Vous devez avoir acheté vous-même au moins un produit pour recevoir une commission ou une récompense.',
        'La commission n’est versée que si votre invité a fait un dépôt validé.',
        'L’inscription seule n’est pas rémunérée : seuls les achats de produits comptent.',
      ],
    },
    {
      slug: 'inviter',
      title: 'Inviter une personne',
      summary: 'Partager votre lien ou votre code de parrainage.',
      icon: Share2,
      intro: <p>Le plus simple est d'envoyer votre lien d'invitation : le code y est déjà inclus.</p>,
      steps: [
        {
          title: 'Ouvrez « Mon équipe »',
          body: <p>Depuis votre espace (Compte), touchez « Mon équipe ». Votre code personnel est affiché en haut.</p>,
          mockup: 'referral',
          focus: 1,
        },
        {
          title: 'Copiez votre lien d’invitation',
          body: <p>Touchez le bouton de copie à côté du lien, puis collez-le dans WhatsApp, un SMS ou un réseau social.</p>,
          mockup: 'referral',
          focus: 2,
        },
        {
          title: 'Votre invité ouvre le lien',
          body: <p>La page d'inscription s'ouvre avec votre code déjà rempli. Il crée son compte avec son propre numéro.</p>,
          mockup: 'register-ref',
          focus: 3,
        },
        {
          title: 'Suivez votre équipe',
          body: <p>Vous recevez une notification à chaque nouvel invité. Dans « Mon équipe », vous voyez qui a déjà investi et vos commissions.</p>,
          mockup: 'referral',
          focus: 4,
        },
      ],
      rules: [
        'Le code n’apparaît dans le formulaire d’inscription que si l’invité ouvre votre lien : envoyez le lien plutôt que le code seul.',
        'Chaque invité doit utiliser son propre numéro (un numéro = un compte).',
      ],
    },
    {
      slug: 'bonus-et-notifications',
      title: 'Bonus surprise et notifications',
      summary: 'Codes cadeaux et alertes sur votre téléphone.',
      icon: Gift,
      intro: <p>Restez informé en temps réel et profitez des codes cadeaux partagés dans le groupe.</p>,
      steps: [
        {
          title: 'Entrez le code du bonus surprise',
          body: <p>Un code de 8 caractères est partagé dans le groupe. Entrez-le dans « Bonus surprise » (Compte).</p>,
          mockup: 'gift',
          focus: 1,
        },
        {
          title: 'Soyez parmi les premiers',
          body: <p>Seuls les premiers membres à entrer le code gagnent, avant la date limite. Le montant est crédité aussitôt sur votre solde.</p>,
          mockup: 'gift',
          focus: 2,
        },
        {
          title: 'Activez les notifications',
          body: <p>Sur le tableau de bord ou la page Notifications, touchez « Activer », puis autorisez les notifications sur votre téléphone.</p>,
          mockup: 'push',
          focus: 2,
        },
      ],
      rules: [
        'Le bonus surprise est réservé aux membres ayant déjà acheté un produit.',
        'Vous êtes prévenu des dépôts et retraits traités, achats confirmés, revenus du jour, nouveaux invités, bonus et annonces.',
        'Notifications bloquées : autorisez-les dans les réglages du téléphone.',
      ],
    },
    {
      slug: 'a-propos',
      title: 'À propos de Drivest',
      summary: 'Notre histoire, notre date de création et notre but.',
      icon: Building2,
      intro: (
        <div className="space-y-4">
          <section>
            <h3 className="font-semibold text-slate-900">Notre histoire</h3>
            <p className="mt-1"><Missing>histoire de l'entreprise</Missing></p>
          </section>
          <section>
            <h3 className="font-semibold text-slate-900">Date de création</h3>
            <p className="mt-1">Drivest a été créée le 18 novembre 2022.</p>
            <p className="mt-1">Lancement du site et de l'achat de produits en ligne : 2 novembre 2026.</p>
          </section>
          <section>
            <h3 className="font-semibold text-slate-900">Notre but</h3>
            <p className="mt-1"><Missing>but / mission de l'entreprise</Missing></p>
          </section>
        </div>
      ),
      steps: [],
    },
  ];
}
