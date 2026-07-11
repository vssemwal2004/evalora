export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="field-label text-brand-600">{eyebrow}</p> : null}
        <h2 className="mt-0.5 text-base font-semibold leading-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function SectionPanel({ title, description, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || description || actions) ? (
        <div className="panel-heading">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brand-100 bg-brand-50 text-brand-600">
                <Icon size={16} />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h3 className="text-[13px] font-semibold text-slate-950">{title}</h3> : null}
              {description ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, icon: Icon, helper, tone = 'default' }) {
  const toneClass = tone === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-brand-600 bg-brand-50 border-brand-100';
  const isLoading = value === '...' || value === null;

  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
          {isLoading ? <span className="mt-2 block h-5 w-14 animate-pulse rounded bg-slate-200" aria-label="Loading metric" /> : <p className="mt-1 text-lg font-semibold leading-none text-slate-950">{value}</p>}
        </div>
        {Icon ? (
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${toneClass}`}>
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      {helper ? <p className="mt-2 text-[11px] leading-4 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }) {
  const isLoading = /^loading\b/i.test(String(title || ''));
  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-5" aria-label={title} role="status">
        <span className="sr-only">{title}</span>
        {Array.from({ length: 5 }, (_, index) => (
          <div className="grid grid-cols-[2fr_1fr_0.8fr] gap-4 rounded-lg border border-slate-100 p-3" key={index}>
            <div className="h-4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 animate-pulse rounded bg-slate-100" />
            <div className="h-4 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-h-24 flex-col items-center justify-center px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}
