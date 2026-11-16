import type { ReactNode } from 'react';
import { BellRing, CheckCircle2, Circle, Copy, Eye, Gift, Lock, Phone, User } from 'lucide-react';

/**
 * Illustrations du guide : reproductions simplifiées des vrais écrans de l'application
 * (mêmes libellés et mêmes couleurs), sans aucune donnée personnelle.
 * L'élément concerné par l'étape est entouré et numéroté.
 */

export type MockupName =
  | 'register'
  | 'register-ref'
  | 'login'
  | 'welcome'
  | 'deposit'
  | 'deposit-history'
  | 'withdrawal-setup'
  | 'withdrawal'
  | 'referral'
  | 'gift'
  | 'push';

function Spot({ n, focus, children }: { n: number; focus?: number; children: ReactNode }) {
  const active = focus === n;
  return (
    <div className={`relative rounded-xl transition ${active ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}>
      {active && (
        <span className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-night-950 shadow">
          {n}
        </span>
      )}
      {children}
    </div>
  );
}

function Input({ icon, text, mono, muted }: { icon?: ReactNode; text: string; mono?: boolean; muted?: boolean }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px]">
      {icon}
      <span className={`${mono ? 'font-mono tracking-wider' : ''} ${muted ? 'text-slate-400' : 'text-slate-800'} truncate`}>{text}</span>
    </div>
  );
}

function Button({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`flex h-9 items-center justify-center rounded-lg text-[11px] font-semibold ${dark ? 'bg-accent-700 text-white' : 'bg-accent-500 text-night-950'}`}>
      {children}
    </div>
  );
}

/** Cadre de téléphone autour d'un écran. */
function PhoneFrame({ title, children, auth }: { title?: string; children: ReactNode; auth?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[270px] rounded-[2rem] bg-night-950 p-2 shadow-xl ring-1 ring-night-800" aria-hidden="true">
      <div className="overflow-hidden rounded-[1.6rem] bg-slate-50">
        <div className="flex h-6 items-center justify-center bg-night-950">
          <span className="h-1.5 w-14 rounded-full bg-night-800" />
        </div>
        {auth ? (
          <div className="bg-gradient-to-b from-slate-50 via-white to-accent-50 p-3">{children}</div>
        ) : (
          <>
            <div className="flex h-9 items-center bg-night-950 px-3">
              <span className="text-xs font-extrabold text-white">Drive<span className="text-accent-400">st</span></span>
            </div>
            <div className="space-y-2.5 p-3">
              {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
              {children}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/90 p-3 shadow-md">
      <p className="text-center text-sm font-extrabold text-night-900">Drive<span className="text-accent-500">st</span></p>
      <p className="mt-2 text-center text-base font-bold text-slate-900">{title}</p>
      <p className="text-center text-[10px] text-slate-500">{subtitle}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

const phoneIcon = <Phone className="h-3 w-3 shrink-0 text-slate-400" />;
const lockIcon = <Lock className="h-3 w-3 shrink-0 text-slate-400" />;
const eyeIcon = <Eye className="ml-auto h-3 w-3 shrink-0 text-slate-300" />;

function PasswordInput({ text }: { text: string }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-400">
      {lockIcon}
      <span className="truncate">{text}</span>
      {eyeIcon}
    </div>
  );
}

function PhoneInput() {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px]">
      {phoneIcon}
      <span className="font-semibold text-slate-600">+243</span>
      <span className="h-4 w-px bg-slate-200" />
      <span className="text-slate-400">0971234567</span>
    </div>
  );
}

function RegisterScreen({ focus, withRef }: { focus?: number; withRef?: boolean }) {
  return (
    <PhoneFrame auth>
      <AuthCard title="Bienvenue" subtitle="Créez votre compte en quelques secondes.">
        <Spot n={1} focus={focus}><PhoneInput /></Spot>
        <Spot n={2} focus={focus}>
          <div className="space-y-2">
            <PasswordInput text="Mot de passe (min. 6)" />
            <PasswordInput text="Confirmer le mot de passe" />
          </div>
        </Spot>
        {withRef && (
          <Spot n={3} focus={focus}>
            <Input icon={<Gift className="h-3 w-3 shrink-0 text-slate-500" />} text="AB12CD34" mono />
          </Spot>
        )}
        <Spot n={withRef ? 4 : 3} focus={focus}><Button>Créer mon compte</Button></Spot>
        <p className="text-center text-[10px] text-slate-500">Déjà inscrit ? <span className="font-semibold text-accent-700">Se connecter</span></p>
      </AuthCard>
    </PhoneFrame>
  );
}

function LoginScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame auth>
      <AuthCard title="Bon retour" subtitle="Connectez-vous pour accéder à votre espace.">
        <div className="rounded-lg border border-accent-200 bg-accent-50 p-2 text-[10px] text-accent-900">
          Votre compte a été créé. Connectez-vous avec votre mot de passe.
        </div>
        <Spot n={1} focus={focus}>
          <div className="space-y-2">
            <PhoneInput />
            <PasswordInput text="Entrez votre mot de passe" />
          </div>
        </Spot>
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-accent-600" /> Se souvenir de moi</span>
          <span>Mot de passe oublié ?</span>
        </div>
        <Spot n={2} focus={focus}><Button>Connexion</Button></Spot>
      </AuthCard>
    </PhoneFrame>
  );
}

function WelcomeScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame auth>
      <AuthCard title="Bienvenue sur Drivest" subtitle="Complétez vos informations pour accéder à votre compte.">
        <Spot n={1} focus={focus}>
          <div className="space-y-2">
            <Input icon={<User className="h-3 w-3 shrink-0 text-slate-400" />} text="Nom complet" muted />
            <Input text="Province ▾" muted />
            <Input text="Ville" muted />
          </div>
        </Spot>
        <Spot n={2} focus={focus}><Button>Continuer</Button></Spot>
      </AuthCard>
    </PhoneFrame>
  );
}

function DepositScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Dépôt">
      <div className="space-y-2.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
        <Spot n={1} focus={focus}>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-[10px] font-semibold">
            <span className="rounded-lg bg-white px-2 py-1.5 text-accent-800 shadow">Airtel Money</span>
            <span className="px-2 py-1.5 text-slate-500">Autre moyen</span>
          </div>
        </Spot>
        <Spot n={2} focus={focus}>
          <div>
            <p className="mb-1 text-[10px] font-medium text-slate-700">Montant (FC)</p>
            <Input text="20000" />
          </div>
        </Spot>
        <Spot n={3} focus={focus}>
          <div className="space-y-1.5 rounded-xl border border-accent-200 bg-accent-50/60 p-2">
            <p className="text-[10px] font-bold text-accent-900">Effectuez le paiement vers Airtel Money</p>
            <p className="text-[9px] text-slate-500">Compte Airtel Money</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-accent-900">09•• ••• •••</p>
              <span className="rounded-md bg-accent-700 px-2 py-1 text-[9px] font-semibold text-white">Copier</span>
            </div>
          </div>
        </Spot>
        <Spot n={4} focus={focus}>
          <div>
            <p className="mb-1 text-[10px] font-medium text-slate-700">Référence de la transaction</p>
            <Input text="Ex : MP240912.1234.A56789" muted />
          </div>
        </Spot>
        <Spot n={5} focus={focus}><Button dark>Confirmer le dépôt</Button></Spot>
      </div>
    </PhoneFrame>
  );
}

function DepositHistoryScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Mes dépôts">
      <Spot n={1} focus={focus}>
        <div className="space-y-1.5">
          {[
            { label: 'En attente', tone: 'bg-amber-100 text-amber-800' },
            { label: 'Validé', tone: 'bg-accent-100 text-accent-800' },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded-xl bg-white p-2.5 text-[11px] shadow-sm ring-1 ring-slate-100">
              <div>
                <p className="font-semibold text-slate-900">Dépôt · Airtel Money</p>
                <p className="text-[9px] text-slate-500">20 000 FC</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${s.tone}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </Spot>
      <Spot n={2} focus={focus}>
        <div className="flex items-start gap-2 rounded-xl bg-night-900 p-2.5 text-[10px] text-white">
          <BellRing className="h-3.5 w-3.5 shrink-0 text-accent-300" />
          <span>Votre dépôt de 20 000 FC a été validé.</span>
        </div>
      </Spot>
    </PhoneFrame>
  );
}

function WithdrawalSetupScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Retrait">
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <p className="text-[11px] font-semibold">Configurer mon portefeuille de paiement</p>
        <p className="text-[9px] text-slate-500">À faire une seule fois : ce compte recevra vos retraits.</p>
        <Spot n={1} focus={focus}>
          <div className="flex gap-1.5 text-[10px] font-semibold">
            <span className="rounded-lg border border-accent-600 bg-accent-50 px-2 py-1 text-accent-800">Airtel Money</span>
            <span className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500">Autre réseau</span>
          </div>
        </Spot>
        <Spot n={2} focus={focus}>
          <div className="space-y-1.5">
            <Input text="Nom du titulaire" muted />
            <Input icon={phoneIcon} text="0971234567" muted />
          </div>
        </Spot>
        <Spot n={3} focus={focus}>
          <div className="space-y-1.5">
            <PasswordInput text="Mot de passe de retrait" />
            <PasswordInput text="Confirmez le mot de passe" />
          </div>
        </Spot>
        <Spot n={4} focus={focus}><Button>Enregistrer</Button></Spot>
      </div>
    </PhoneFrame>
  );
}

function WithdrawalScreen({ focus }: { focus?: number }) {
  const items = [
    { label: 'Avoir fait au moins un dépôt validé', met: true },
    { label: 'Avoir acheté au moins un produit Prestige (compte certifié)', met: true },
    { label: 'Mobile Money et mot de passe de retrait configurés', met: true },
    { label: 'Retrait définitif une fois soumis' },
  ];
  return (
    <PhoneFrame title="Retrait">
      <Spot n={1} focus={focus}>
        <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
          <p className="text-[11px] font-semibold">Conditions</p>
          <ul className="mt-1 space-y-1 text-[9px] text-slate-600">
            {items.map(({ label, met }) => (
              <li key={label} className="flex items-start gap-1.5">
                {met === undefined ? <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" /> : met ? <CheckCircle2 className="h-3 w-3 shrink-0 text-accent-600" /> : <Circle className="h-3 w-3 shrink-0 text-slate-300" />}
                {label}
              </li>
            ))}
          </ul>
        </div>
      </Spot>
      <Spot n={2} focus={focus}>
        <div>
          <p className="mb-1 text-[10px] font-medium text-slate-700">Montant à retirer (FC)</p>
          <Input text="15000" />
        </div>
      </Spot>
      <Spot n={3} focus={focus}><PasswordInput text="Mot de passe de retrait" /></Spot>
      <Spot n={4} focus={focus}><Button>Confirmer le retrait</Button></Spot>
    </PhoneFrame>
  );
}

function ReferralScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Mon équipe">
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <p className="text-[9px] text-slate-500">Votre code</p>
        <Spot n={1} focus={focus}>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-night-900 px-2.5 py-1 font-mono text-xs font-bold tracking-widest text-white">AB12CD34</span>
            <span className="flex items-center gap-1 rounded-md border border-slate-300 px-1.5 py-1 text-[9px]"><Copy className="h-2.5 w-2.5" /> Copier</span>
          </div>
        </Spot>
        <p className="text-[9px] text-slate-500">Lien d'invitation</p>
        <Spot n={2} focus={focus}>
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1"><Input text="…/inscription?ref=AB12CD34" mono /></div>
            <span className="flex w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300"><Copy className="h-3 w-3" /></span>
          </div>
        </Spot>
      </div>
      <Spot n={3} focus={focus}>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {['Vos invités', 'Leurs invités', 'Niveau 3'].map((l) => (
            <div key={l} className="rounded-lg bg-accent-50 p-1.5">
              <p className="text-xs font-bold text-accent-700">… %</p>
              <p className="text-[9px]">{l}</p>
            </div>
          ))}
        </div>
      </Spot>
      <Spot n={4} focus={focus}>
        <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
          <p className="text-[10px] font-semibold">Récompenses d'équipe</p>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 rounded-full bg-accent-500" />
          </div>
          <p className="mt-1 text-[9px] text-slate-500">invités directs ayant investi</p>
        </div>
      </Spot>
    </PhoneFrame>
  );
}

function GiftScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Bonus surprise">
      <div className="space-y-2 rounded-2xl bg-gradient-to-br from-night-800 to-night-950 p-3 text-white">
        <p className="flex items-start gap-1.5 text-[9px] text-night-100">
          <Gift className="h-3.5 w-3.5 shrink-0 text-accent-300" /> Réservé aux membres qui ont déjà acheté un produit. Seuls les premiers à entrer le code gagnent.
        </p>
        <Spot n={1} focus={focus}>
          <div className="flex h-10 items-center justify-center rounded-xl bg-white font-mono text-base font-bold tracking-[0.3em] text-slate-300">CODE</div>
        </Spot>
        <Spot n={2} focus={focus}><Button>Recevoir mon bonus</Button></Spot>
      </div>
    </PhoneFrame>
  );
}

function PushScreen({ focus }: { focus?: number }) {
  return (
    <PhoneFrame title="Notifications">
      <Spot n={1} focus={focus}>
        <div className="space-y-2 rounded-xl bg-night-900 p-2.5 text-white">
          <p className="flex items-start gap-1.5 text-[9px]">
            <BellRing className="h-3.5 w-3.5 shrink-0 text-accent-300" />
            Activez les notifications pour être prévenu des dépôts, retraits, revenus du jour, bonus et annonces.
          </p>
          <div className="flex h-7 items-center justify-center rounded-lg bg-accent-500 text-[10px] font-semibold text-night-950">Activer</div>
        </div>
      </Spot>
      <Spot n={2} focus={focus}>
        <div className="rounded-xl bg-white p-2.5 text-[10px] shadow-sm ring-1 ring-slate-100">
          <p className="text-[9px] text-slate-500">« drivest » souhaite vous envoyer des notifications</p>
          <div className="mt-1.5 flex justify-end gap-3 font-semibold text-accent-700">
            <span className="text-slate-400">Bloquer</span>
            <span>Autoriser</span>
          </div>
        </div>
      </Spot>
    </PhoneFrame>
  );
}

export function GuideMockup({ name, focus }: { name: MockupName; focus?: number }) {
  switch (name) {
    case 'register':
      return <RegisterScreen focus={focus} />;
    case 'register-ref':
      return <RegisterScreen focus={focus} withRef />;
    case 'login':
      return <LoginScreen focus={focus} />;
    case 'welcome':
      return <WelcomeScreen focus={focus} />;
    case 'deposit':
      return <DepositScreen focus={focus} />;
    case 'deposit-history':
      return <DepositHistoryScreen focus={focus} />;
    case 'withdrawal-setup':
      return <WithdrawalSetupScreen focus={focus} />;
    case 'withdrawal':
      return <WithdrawalScreen focus={focus} />;
    case 'referral':
      return <ReferralScreen focus={focus} />;
    case 'gift':
      return <GiftScreen focus={focus} />;
    case 'push':
      return <PushScreen focus={focus} />;
  }
}
