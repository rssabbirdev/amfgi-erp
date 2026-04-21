import Link from 'next/link';

type LegalSection = {
  heading: string;
  body: string[];
};

export default function LegalPage({
  eyebrow,
  title,
  summary,
  updatedOn,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updatedOn: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_55%,#ffffff_100%)] text-slate-900 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_55%,#020617_100%)] dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-slate-200/80 bg-white/90 px-6 py-8 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-slate-950/75">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold tracking-[0.18em] text-sky-700 uppercase dark:bg-sky-500/15 dark:text-sky-200">
              {eyebrow}
            </span>
            <span className="text-slate-500 dark:text-slate-400">Last updated {updatedOn}</span>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/privacy-policy"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
            >
              Terms of Service
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-transparent bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Open App
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4">
          {sections.map((section) => (
            <article
              key={section.heading}
              className="rounded-[24px] border border-slate-200/80 bg-white/90 px-6 py-6 shadow-[0_20px_70px_-50px_rgba(15,23,42,0.5)] backdrop-blur dark:border-white/10 dark:bg-slate-950/75"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-[15px]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <footer className="mt-8 pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Almuraqib Fiber Glass Industry LLC, Dubai, United Arab Emirates
        </footer>
      </div>
    </main>
  );
}
