import {LEGAL_DOCUMENTS} from '../legalDocuments';

interface PublicLegalPageProps {
  type: keyof typeof LEGAL_DOCUMENTS;
}

export default function PublicLegalPage({type}: PublicLegalPageProps) {
  const document = LEGAL_DOCUMENTS[type];

  return (
    <section className="min-h-screen bg-slate-50 px-4 pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-3xl">
        <a
          href="/"
          className="inline-flex items-center text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 transition-colors hover:text-indigo-800"
        >
          Back to MyBoma
        </a>
        <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Legal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{document.title}</h1>
          <p className="mt-2 text-xs font-medium text-slate-500">
            Effective {document.effectiveDate} · Version {document.version}
          </p>
          <div className="mt-8 space-y-7">
            {document.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>
        </article>
        <div className="mt-6 flex flex-wrap gap-4 px-2 text-xs font-medium text-slate-500">
          <a className="transition-colors hover:text-indigo-600" href="/terms">
            Terms and Conditions
          </a>
          <a className="transition-colors hover:text-indigo-600" href="/privacy">
            Privacy Policy
          </a>
          <a className="transition-colors hover:text-indigo-600" href="/#unsubscribe">
            Unsubscribe from emails
          </a>
        </div>
      </div>
    </section>
  );
}
