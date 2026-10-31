import { TeamRewardTiersEditor } from '../../components/admin/TeamRewardTiersEditor';
import { WalletRulesCard } from '../../components/admin/WalletRulesCard';
import { PageHeader } from '../../components/layout/SideNavLayout';
import { PageMeta } from '../../components/PageMeta';

/** Tous les chiffres qui décident de l'argent des membres, réunis sur une page. */
export default function AdminRulesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageMeta title="Règles et bonus — Administration" noindex />
      <PageHeader
        title="Règles et bonus"
        description="Chaque modification s'applique aux opérations suivantes, pas à celles déjà faites, et reste dans le journal d'audit."
      />
      <WalletRulesCard
        title="Retraits"
        hint="Les frais sont déduits du montant demandé : à 5 %, un retrait de 10 000 FC envoie 9 500 FC."
        keys={['min_withdrawal', 'withdrawal_fee_percent']}
      />
      <WalletRulesCard
        title="Parrainage"
        hint="Pourcentage du prix de chaque produit acheté par l'équipe, versé au parrain du niveau correspondant."
        keys={['referral_commission_percent', 'referral_level2_percent', 'referral_level3_percent']}
      />
      <WalletRulesCard
        title="Dépôt et bonus"
        hint="Le bonus d'inscription est crédité une fois à chaque nouveau compte (0 pour le supprimer)."
        keys={['min_deposit', 'signup_bonus']}
      />
      <TeamRewardTiersEditor />
    </div>
  );
}
