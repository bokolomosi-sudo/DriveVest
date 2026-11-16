import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Missing, useCompanyInfo } from '../../components/info/CompanyInfo';

export type LegalDocKey = 'mentions' | 'privacy' | 'terms' | 'cookies';

export const LEGAL_DOCS: { key: LegalDocKey; path: string; title: string; description: string }[] = [
  { key: 'terms', path: '/conditions-utilisation', title: "Conditions générales d'utilisation", description: "Règles d'utilisation de la plateforme Drivest." },
  { key: 'privacy', path: '/confidentialite', title: 'Politique de confidentialité', description: 'Données personnelles collectées par Drivest et vos droits.' },
  { key: 'cookies', path: '/cookies', title: 'Cookies et stockage local', description: "Données enregistrées sur votre appareil par l'application Drivest." },
  { key: 'mentions', path: '/mentions-legales', title: 'Mentions légales', description: "Éditeur, hébergeurs et contact de la plateforme Drivest." },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

const doc = (key: LegalDocKey) => LEGAL_DOCS.find((d) => d.key === key)!.path;

function Mentions() {
  const c = useCompanyInfo();
  return (
    <>
      <Section title="Éditeur">
        <List
          items={[
            <>Raison sociale : {c.name}</>,
            <>Forme juridique : <Missing>forme juridique</Missing></>,
            <>Immatriculation : {c.registration}</>,
            <>Siège social : {c.address}</>,
            <>Pays : <Missing>pays d'établissement</Missing></>,
            <>Téléphone : {c.phone}</>,
            <>E-mail : {c.email}</>,
            <>Directeur de la publication : <Missing>nom du responsable de la publication</Missing></>,
          ]}
        />
      </Section>
      <Section title="Hébergement">
        <List
          items={[
            <>Site web : Vercel Inc., États-Unis (vercel.com).</>,
            <>Base de données, authentification et notifications : Supabase Inc. (supabase.com).</>,
          ]}
        />
      </Section>
      <Section title="Propriété intellectuelle">
        <p>Le nom Drivest, le logo et les contenus de la plateforme appartiennent à l'éditeur. Toute reproduction sans autorisation est interdite.</p>
      </Section>
      <Section title="Contact">
        <p>Pour toute question, utilisez le {c.support} (WhatsApp ou demande écrite) ou l'adresse e-mail ci-dessus.</p>
      </Section>
    </>
  );
}

function Privacy() {
  const c = useCompanyInfo();
  return (
    <>
      <Section title="Responsable du traitement">
        <p>{c.name}, {c.address}. Contact : {c.email} ou le {c.support}.</p>
      </Section>
      <Section title="Données que nous collectons">
        <List
          items={[
            <><strong>Compte</strong> : numéro de téléphone (identifiant de connexion) et mot de passe, géré par Supabase Auth et conservé uniquement sous forme chiffrée (haché).</>,
            <><strong>Profil</strong> : nom complet, province et ville, code de parrainage et parrain éventuel.</>,
            <><strong>Opérations</strong> : dépôts (montant, moyen de paiement, référence de la transaction), achats de produits, revenus, commissions, bonus et retraits.</>,
            <><strong>Compte de retrait</strong> : réseau Mobile Money, nom du titulaire, numéro, et mot de passe de retrait conservé haché.</>,
            <><strong>Vérification des paiements</strong> : SMS de confirmation reçus par le téléphone de Drivest (expéditeur, contenu, montant, référence), utilisés pour valider automatiquement les dépôts.</>,
            <><strong>Notifications push</strong> : si vous les activez, l'adresse technique d'abonnement de votre appareil, ses clés de chiffrement et le type de navigateur.</>,
            <><strong>Service client</strong> : demandes écrites et réponses ; messages échangés sur WhatsApp, selon les règles de WhatsApp.</>,
            <><strong>Sécurité</strong> : journal des actions de l'administration et horodatage des opérations.</>,
          ]}
        />
        <p>Nous ne demandons ni e-mail, ni pièce d'identité, ni coordonnées bancaires, et n'utilisons aucun outil de publicité ou de mesure d'audience.</p>
      </Section>
      <Section title="Pourquoi nous les utilisons">
        <List
          items={[
            'Créer et sécuriser votre compte (un numéro de téléphone = un compte).',
            'Valider vos dépôts, exécuter vos achats et vos retraits, calculer vos revenus et commissions.',
            'Gérer le parrainage et les récompenses d’équipe.',
            'Vous envoyer des notifications sur votre compte (dépôts, retraits, revenus, bonus, annonces).',
            'Répondre à vos demandes et prévenir la fraude.',
          ]}
        />
      </Section>
      <Section title="Qui peut voir vos données">
        <List
          items={[
            "L'administration de Drivest, pour traiter les opérations et le service client.",
            "Votre parrain (jusqu'au 3e niveau) voit dans « Mon équipe » votre nom, votre numéro de téléphone, votre ville et votre province, votre date d'inscription, le nombre de produits achetés, le montant investi et les commissions qu'il a reçues grâce à vous.",
            'Nos prestataires techniques : Supabase (base de données, authentification), Vercel (hébergement du site) et les services de notification push de votre navigateur ou téléphone.',
          ]}
        />
        <p>Vos données ne sont jamais vendues.</p>
      </Section>
      <Section title="Durée de conservation">
        <p>
          Les données du compte sont conservées tant que le compte est actif. Un abonnement push est supprimé dès qu'il
          n'est plus valide (notifications retirées sur l'appareil) ; un appareil n'est rattaché qu'au dernier compte connecté dessus.
        </p>
      </Section>
      <Section title="Sécurité">
        <p>
          Les échanges sont chiffrés (HTTPS). L'accès aux données est limité par des règles de sécurité au niveau de la base
          (chaque membre ne lit que ses propres données) et toutes les opérations financières passent par des fonctions
          contrôlées côté serveur.
        </p>
      </Section>
      <Section title="Vos droits">
        <p>
          Vous pouvez demander l'accès, la correction ou la suppression de vos données, ou la fermeture de votre compte, en
          contactant le {c.support} ou {c.email}. Le nom, la province et la ville se modifient aussi depuis la page Profil.
        </p>
      </Section>
      <Section title="Stockage sur votre appareil">
        <p>Voir la page <Link to={doc('cookies')} className="font-medium text-accent-700 underline">Cookies et stockage local</Link>.</p>
      </Section>
    </>
  );
}

function Terms() {
  const c = useCompanyInfo();
  return (
    <>
      <Section title="1. Objet">
        <p>
          Les présentes conditions encadrent l'utilisation de la plateforme Drivest (site web et application), éditée par{' '}
          {c.name}. Créer un compte vaut acceptation de ces conditions.
        </p>
      </Section>
      <Section title="2. Compte">
        <List
          items={[
            'L’inscription se fait avec un numéro de téléphone de la RDC et un mot de passe. Un numéro ne peut ouvrir qu’un seul compte.',
            'Vous devez fournir des informations exactes (nom, province, ville) et garder vos mots de passe secrets. Toute opération faite avec vos identifiants est réputée faite par vous.',
            'Drivest peut suspendre un compte en cas de fraude, de fausse déclaration ou de non-respect des présentes conditions.',
          ]}
        />
      </Section>
      <Section title="3. Dépôts">
        <List
          items={[
            'Les dépôts se font par Mobile Money vers les comptes indiqués dans l’application. Vous déclarez le montant et la référence de la transaction ; le solde n’est crédité qu’après validation.',
            'Une référence ne peut être utilisée qu’une fois. Un dépôt dont le montant ou la référence ne correspond pas au paiement reçu n’est pas crédité.',
            'Au moins un dépôt validé est nécessaire pour acheter un produit et pour retirer.',
          ]}
        />
      </Section>
      <Section title="4. Produits et revenus">
        <List
          items={[
            'Les produits sont achetés avec le solde du compte. Les conditions de chaque produit (prix, durée, revenus) sont affichées sur sa fiche avant l’achat.',
            'Un membre peut détenir au maximum 6 produits actifs en même temps.',
          ]}
        />
      </Section>
      <Section title="5. Retraits">
        <List
          items={[
            'Pour retirer, il faut au moins un dépôt validé et au moins un produit Prestige acheté (compte certifié), ainsi qu’un compte de retrait et un mot de passe de retrait configurés.',
            'Le montant minimum et les frais en vigueur sont affichés avant la confirmation. Le montant est bloqué dès la demande ; un retrait soumis est définitif.',
            'Le compte de retrait enregistré ne peut être modifié que par le service client.',
          ]}
        />
      </Section>
      <Section title="6. Parrainage et bonus">
        <List
          items={[
            'Les commissions de parrainage portent sur les achats de produits des membres de votre équipe (3 niveaux), aux taux affichés dans « Mon équipe ».',
            'Pour recevoir une commission ou une récompense d’équipe, vous devez avoir acheté au moins un produit ; la commission n’est versée que si l’invité a fait un dépôt validé. L’inscription seule n’est pas rémunérée.',
            'Les bonus surprise sont réservés aux membres ayant acheté un produit, dans la limite du nombre de gagnants et de la date indiqués.',
            'Créer plusieurs comptes ou de faux comptes pour obtenir des commissions ou des bonus est interdit.',
          ]}
        />
      </Section>
      <Section title="7. Notifications">
        <p>Les notifications push sont facultatives et peuvent être désactivées à tout moment dans les réglages de votre appareil.</p>
      </Section>
      <Section title="8. Responsabilité">
        <p>
          Drivest met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité de la plateforme, mais ne
          peut être tenu responsable d'une interruption due à un opérateur Mobile Money, au réseau ou à un cas de force majeure.
        </p>
      </Section>
      <Section title="9. Modification des conditions">
        <p>Ces conditions peuvent évoluer ; la version en vigueur est toujours celle publiée sur cette page.</p>
      </Section>
    </>
  );
}

function Cookies() {
  return (
    <>
      <Section title="Pas de cookies publicitaires">
        <p>
          Drivest n'utilise aucun cookie publicitaire ni outil de mesure d'audience. L'application enregistre seulement sur
          votre appareil les éléments nécessaires à son fonctionnement (stockage local du navigateur) :
        </p>
        <List
          items={[
            <><strong>Session de connexion</strong> (Supabase Auth) : vous garde connecté.</>,
            <><strong>« Se souvenir de moi »</strong> : votre choix, et un marqueur de session qui disparaît à la fermeture du navigateur si l'option est décochée.</>,
            <><strong>Copie de votre profil</strong> : accélère l'ouverture de l'application ; effacée à la déconnexion.</>,
            <><strong>Invitation à installer l'application</strong> : retient que vous l'avez fermée.</>,
            <><strong>Mise à jour de l'application</strong> : marqueur temporaire qui évite de recharger la page en boucle après une mise à jour.</>,
            <><strong>Fichiers hors ligne et notifications</strong> : un service worker garde certains fichiers pour un chargement rapide et reçoit les notifications push si vous les avez activées.</>,
          ]}
        />
      </Section>
      <Section title="Contenus externes">
        <p>Certaines images (photos de véhicules) peuvent être chargées depuis des services tiers d'hébergement d'images, qui reçoivent alors l'adresse IP de votre appareil.</p>
      </Section>
      <Section title="Vos choix">
        <p>
          Vous pouvez effacer ces données dans les réglages de votre navigateur (données de site) ou en vous déconnectant ;
          vous devrez alors vous reconnecter. Les notifications se désactivent dans les réglages du téléphone.
        </p>
      </Section>
    </>
  );
}

export function LegalDocBody({ docKey }: { docKey: LegalDocKey }) {
  switch (docKey) {
    case 'mentions':
      return <Mentions />;
    case 'privacy':
      return <Privacy />;
    case 'terms':
      return <Terms />;
    case 'cookies':
      return <Cookies />;
  }
}
