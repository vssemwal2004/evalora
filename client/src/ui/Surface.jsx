export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="field-label text-brand-600">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionPanel({ title, description, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      {(title || description || actions) ? (
        <div className="panel-heading">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-100 bg-brand-50 text-brand-600">
                <Icon size={17} />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h3 className="text-sm font-semibold text-slate-950">{title}</h3> : null}
              {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, icon: Icon, helper, tone = 'default' }) {
  const toneClass = tone === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-brand-600 bg-brand-50 border-brand-100';

  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-slate-950">{value}</p>
        </div>
        {Icon ? (
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${toneClass}`}>
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      {helper ? <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}
