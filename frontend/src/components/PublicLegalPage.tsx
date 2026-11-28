import { ArrowLeft } from 'lucide-react';
import { LEGAL_DOCUMENTS } from '../../../shared/legalDocuments';

interface PublicLegalPageProps {
  type: keyof typeof LEGAL_DOCUMENTS;
}

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function PublicLegalPage({ type }: PublicLegalPageProps) {
  const document = LEGAL_DOCUMENTS[type];
  const other = type === 'terms' ? { href: '/privacy', label: 'Privacy Policy' } : { href: '/terms', label: 'Terms of Use' };

  return (
    <section className="min-h-screen bg-zinc-50 px-4 pb-20 pt-28 sm:pt-32">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950">
          <ArrowLeft className="h-4 w-4" /> Back to MyBoma
        </a>

        <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Sections" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">On this page</p>
              <ol className="mt-3 space-y-2 border-l border-zinc-200">
                {document.sections.map((section) => (
                  <li key={section.title}>
                    <a href={`#${slug(section.title)}`} className="-ml-px block border-l border-transparent pl-3 text-sm text-zinc-600 transition hover:border-zinc-950 hover:text-zinc-950">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-10">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">{document.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Effective {document.effectiveDate} · Version {document.version}
            </p>
            <div className="mt-10 space-y-8">
              {document.sections.map((section) => (
                <section key={section.title} id={slug(section.title)} className="scroll-mt-28">
                  <h2 className="text-base font-semibold text-zinc-950">{section.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-zinc-600">{section.body}</p>
                </section>
              ))}
            </div>
            <p className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
              Questions? Email <a href="mailto:support@myboma.org" className="font-medium text-zinc-950 underline underline-offset-4">support@myboma.org</a>. Also read our{' '}
              <a href={other.href} className="font-medium text-zinc-950 underline underline-offset-4">{other.label}</a>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
