import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { GuideMockup } from '../../components/info/GuideMockups';
import { PageMeta } from '../../components/PageMeta';
import { useSettings } from '../../context/SettingsContext';
import { guideTopics, type GuideTopic } from './guideTopics';

function TopicNav({ topics, current }: { topics: GuideTopic[]; current?: string }) {
  return (
    <nav aria-label="Sujets du guide" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {topics.map((t, i) => {
        const active = t.slug === current;
        return (
          <Link
            key={t.slug}
            to={`/guide/${t.slug}`}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-night-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-accent-500 text-night-950' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
            {t.title}
          </Link>
        );
      })}
    </nav>
  );
}

function GuideIndex({ topics }: { topics: GuideTopic[] }) {
  return (
    <div className="container-page max-w-5xl py-6 sm:py-10">
      <PageMeta title="Guide d'utilisation" description="Guide illustré de Drivest : inscription, dépôt, retrait, parrainage et invitations." />
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-night-900 text-accent-400"><BookOpen className="h-6 w-6" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Guide d'utilisation</h1>
          <p className="text-sm text-slate-500">Toutes les étapes, illustrées, pour bien utiliser Drivest.</p>
        </div>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2">
        {topics.map((t, i) => (
          <li key={t.slug}>
            <Link to={`/guide/${t.slug}`} className="card flex h-full items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700"><t.icon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Étape {i + 1}</p>
                <p className="font-semibold text-slate-900">{t.title}</p>
                <p className="mt-1 text-sm text-slate-500">{t.summary}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex justify-center">
        <Link to={`/guide/${topics[0].slug}`} className="btn-primary h-12 rounded-2xl px-6 text-base">
          Commencer le guide <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default function GuidePage() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const topics = guideTopics(settings);
  if (!slug) return <GuideIndex topics={topics} />;

  const index = topics.findIndex((t) => t.slug === slug);
  if (index < 0) return <Navigate to="/guide" replace />;
  const topic = topics[index];
  const prev = topics[index - 1];
  const next = topics[index + 1];

  return (
    <div className="container-page max-w-6xl py-6 sm:py-10">
      <PageMeta title={topic.title} description={topic.summary} />
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside className="mb-6 lg:mb-0">
          <Link to="/guide" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <BookOpen className="h-4 w-4" /> Guide d'utilisation
          </Link>
          <TopicNav topics={topics} current={topic.slug} />
        </aside>

        <article className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Sujet {index + 1} sur {topics.length}</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <topic.icon className="h-7 w-7 shrink-0 text-accent-600" aria-hidden="true" /> {topic.title}
          </h1>
          <div className="mt-4 rounded-2xl bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-100 sm:text-base">{topic.intro}</div>

          {topic.steps.length > 0 && (
            <ol className="mt-6 space-y-5">
              {topic.steps.map((step, i) => (
                <li key={step.title} className="card grid items-center gap-5 p-5 md:grid-cols-[1fr_270px]">
                  <div className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-sm font-bold text-night-950">{i + 1}</span>
                    <div className="min-w-0 text-sm leading-relaxed text-slate-600 sm:text-base">
                      <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{step.title}</h2>
                      <div className="mt-1">{step.body}</div>
                    </div>
                  </div>
                  {step.mockup && (
                    <figure>
                      <GuideMockup name={step.mockup} focus={step.focus} />
                      <figcaption className="sr-only">Illustration de l'écran : {step.title}</figcaption>
                    </figure>
                  )}
                </li>
              ))}
            </ol>
          )}

          {topic.rules && (
            <section className="mt-6 rounded-2xl border border-accent-200 bg-accent-50/60 p-5">
              <h2 className="font-semibold text-accent-900">À retenir</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {topic.rules.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" /> <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav aria-label="Navigation du guide" className="mt-8 grid grid-cols-2 gap-3">
            {prev ? (
              <Link to={`/guide/${prev.slug}`} className="card flex items-center gap-2 p-4 text-sm hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0"><span className="block text-xs text-slate-400">Précédent</span><span className="block truncate font-semibold">{prev.title}</span></span>
              </Link>
            ) : <span />}
            {next ? (
              <Link to={`/guide/${next.slug}`} className="card flex items-center justify-end gap-2 p-4 text-right text-sm hover:bg-slate-50">
                <span className="min-w-0"><span className="block text-xs text-slate-400">Suivant</span><span className="block truncate font-semibold">{next.title}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ) : <span />}
          </nav>
        </article>
      </div>
    </div>
  );
}
