import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';

export default function NotFoundPage() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <PageMeta title="Page introuvable" noindex />
      <p className="text-6xl font-extrabold text-night-200">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-slate-500">La page demandée n'existe pas ou a été déplacée.</p>
      <Link to="/" className="btn-primary mt-8">Retour à l'accueil</Link>
    </div>
  );
}
