import { lazyPage } from './lib/lazyPage';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Car,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Receipt,
  ScrollText,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  ShieldCheck,
  ShoppingBag,
  Tags,
  User,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { PlatformSettings } from './types';
import { useSettings } from './context/SettingsContext';
import { PublicLayout } from './components/layout/PublicLayout';
import { SideNavLayout, type SideNavItem } from './components/layout/SideNavLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import VehicleDetailPage from './pages/VehicleDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import WelcomePage from './pages/auth/WelcomePage';

const AnnouncementsPage = lazyPage(() => import('./pages/AnnouncementsPage'));
const MessagesPage = lazyPage(() => import('./pages/MessagesPage'));
const SupportPage = lazyPage(() => import('./pages/SupportPage'));
const LegalPage = lazyPage(() => import('./pages/LegalPage'));

const DashboardPage = lazyPage(() => import('./pages/account/DashboardPage'));
const MyProductsPage = lazyPage(() => import('./pages/account/MyProductsPage'));
const OrderDetailPage = lazyPage(() => import('./pages/account/OrderDetailPage'));
const NotificationsPage = lazyPage(() => import('./pages/account/NotificationsPage'));
const TransactionsPage = lazyPage(() => import('./pages/account/TransactionsPage'));
const ProfilePage = lazyPage(() => import('./pages/account/ProfilePage'));
const SecurityPage = lazyPage(() => import('./pages/account/SecurityPage'));
const WalletPage = lazyPage(() => import('./pages/account/WalletPage'));
const DepositPage = lazyPage(() => import('./pages/account/DepositPage'));
const WithdrawalPage = lazyPage(() => import('./pages/account/WithdrawalPage'));
const ReferralPage = lazyPage(() => import('./pages/account/ReferralPage'));

const AdminDashboardPage = lazyPage(() => import('./pages/admin/AdminDashboardPage'));
const AdminVehiclesPage = lazyPage(() => import('./pages/admin/AdminVehiclesPage'));
const AdminVehicleFormPage = lazyPage(() => import('./pages/admin/AdminVehicleFormPage'));
const AdminCategoriesPage = lazyPage(() => import('./pages/admin/AdminCategoriesPage'));
const AdminOrdersPage = lazyPage(() => import('./pages/admin/AdminOrdersPage'));
const AdminOrderDetailPage = lazyPage(() => import('./pages/admin/AdminOrderDetailPage'));
const AdminFinancePage = lazyPage(() => import('./pages/admin/AdminFinancePage'));
const AdminUsersPage = lazyPage(() => import('./pages/admin/AdminUsersPage'));
const AdminUserDetailPage = lazyPage(() => import('./pages/admin/AdminUserDetailPage'));
const AdminSupportPage = lazyPage(() => import('./pages/admin/AdminSupportPage'));
const AdminAnnouncementsPage = lazyPage(() => import('./pages/admin/AdminAnnouncementsPage'));
const AdminAuditPage = lazyPage(() => import('./pages/admin/AdminAuditPage'));
const AdminSettingsPage = lazyPage(() => import('./pages/admin/AdminSettingsPage'));
const AdminRulesPage = lazyPage(() => import('./pages/admin/AdminRulesPage'));
const AdminRevenuePage = lazyPage(() => import('./pages/admin/AdminRevenuePage'));
const AdminWalletPage = lazyPage(() => import('./pages/admin/AdminWalletPage'));

function accountNav(s: PlatformSettings | null): SideNavItem[] {
  return [
    { to: '/compte', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
    { to: '/compte/produits', label: 'Mes produits', icon: ShoppingBag },
    ...(s?.feature_wallet
      ? [
          { to: '/compte/depot', label: 'Dépôt', icon: ArrowDownToLine },
          { to: '/compte/retrait', label: 'Retrait', icon: ArrowUpFromLine },
          { to: '/compte/portefeuille', label: 'Portefeuille', icon: Wallet },
        ]
      : []),
    ...(s?.feature_referral ? [{ to: '/compte/parrainage', label: 'Mon équipe', icon: UserPlus }] : []),
    { to: '/compte/notifications', label: 'Notifications', icon: Bell },
    { to: '/compte/transactions', label: 'Transactions', icon: Receipt },
    { to: '/compte/profil', label: 'Profil', icon: User },
    { to: '/compte/securite', label: 'Sécurité', icon: ShieldCheck },
  ];
}

const ADMIN_NAV: SideNavItem[] = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/vehicules', label: 'Véhicules', icon: Car },
  { to: '/admin/categories', label: 'Catégories', icon: Tags },
  { to: '/admin/commandes', label: 'Commandes', icon: ShoppingBag },
  { to: '/admin/finances', label: 'Paiements', icon: CreditCard },
  { to: '/admin/portefeuilles', label: 'Dépôts et retraits', icon: Wallet },
  { to: '/admin/regles', label: 'Règles et bonus', icon: SlidersHorizontal },
  { to: '/admin/revenus', label: 'Revenus des produits', icon: TrendingUp },
  { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  { to: '/admin/support', label: 'Service client', icon: LifeBuoy },
  { to: '/admin/annonces', label: 'Annonces', icon: Megaphone },
  { to: '/admin/audit', label: "Journal d'audit", icon: ScrollText },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
];

export default function App() {
  const { settings } = useSettings();
  return (
    <Routes>
      {/* Seules l'inscription et la connexion sont accessibles sans compte */}
      <Route path="inscription" element={<RegisterPage />} />
      <Route path="connexion" element={<LoginPage />} />
      {/* Après la première connexion : nom, province et ville */}
      <Route path="bienvenue" element={<ProtectedRoute allowIncompleteProfile><WelcomePage /></ProtectedRoute>} />

      <Route
        element={
          <ProtectedRoute>
            <PublicLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="catalogue" element={<Navigate to="/produits" replace />} />
        <Route path="vehicules/:id" element={<VehicleDetailPage />} />
        <Route path="actualites" element={<AnnouncementsPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="service-client" element={<SupportPage />} />
        <Route path="mentions-legales" element={<LegalPage />} />

        <Route
          path="compte"
          element={
            <ProtectedRoute>
              <SideNavLayout title="Mon espace" items={accountNav(settings)} hideNavOnMobile />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="produits" element={<MyProductsPage />} />
          <Route path="commandes" element={<Navigate to="/compte/produits" replace />} />
          <Route path="commandes/:id" element={<OrderDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="securite" element={<SecurityPage />} />
          <Route path="portefeuille" element={<WalletPage />} />
          <Route path="depot" element={<DepositPage />} />
          <Route path="retrait" element={<WithdrawalPage />} />
          <Route path="parrainage" element={<ReferralPage />} />
        </Route>

        <Route
          path="admin"
          element={
            <ProtectedRoute requireAdmin>
              <SideNavLayout title="Administration" items={ADMIN_NAV} />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="vehicules" element={<AdminVehiclesPage />} />
          <Route path="vehicules/nouveau" element={<AdminVehicleFormPage />} />
          <Route path="vehicules/:id" element={<AdminVehicleFormPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="commandes" element={<AdminOrdersPage />} />
          <Route path="commandes/:id" element={<AdminOrderDetailPage />} />
          <Route path="finances" element={<AdminFinancePage />} />
          <Route path="utilisateurs" element={<AdminUsersPage />} />
          <Route path="utilisateurs/:id" element={<AdminUserDetailPage />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="annonces" element={<AdminAnnouncementsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route path="parametres" element={<AdminSettingsPage />} />
          <Route path="regles" element={<AdminRulesPage />} />
          <Route path="revenus" element={<AdminRevenuePage />} />
          <Route path="portefeuilles" element={<AdminWalletPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
