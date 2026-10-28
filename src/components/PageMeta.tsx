import { useEffect } from 'react';

const DEFAULT_DESCRIPTION =
  "Drivest : découvrez des véhicules, consultez leurs fiches détaillées, comparez les prix et suivez vos demandes d'achat en ligne.";

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Titre et métadonnées de la page (référencement et partage). */
export function PageMeta({ title, description, noindex = false }: { title: string; description?: string; noindex?: boolean }) {
  useEffect(() => {
    const fullTitle = title.includes('Drivest') ? title : `${title} | Drivest`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'name', 'description', description ?? DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description ?? DEFAULT_DESCRIPTION);
    setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
  }, [title, description, noindex]);
  return null;
}
