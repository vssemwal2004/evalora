import { useLocation } from 'react-router-dom';

function Bar({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/75 ${className}`} />;
}

function AppPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6" aria-label="Loading page" role="status">
      <span className="sr-only">Loading page content</span>
      <div className="flex items-center justify-between gap-5">
        <div className="space-y-2">
          <Bar className="h-3 w-24" />
          <Bar className="h-7 w-56 max-w-[60vw]" />
        </div>
        <Bar className="h-10 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4" key={index}>
            <Bar className="h-3 w-20" />
            <Bar className="mt-4 h-7 w-16" />
            <Bar className="mt-3 h-2.5 w-28 max-w-full" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <Bar className="h-5 w-40" />
          <Bar className="h-9 w-56 max-w-[35vw]" />
        </div>
        <div className="space-y-1 p-3">
          {Array.from({ length: 7 }, (_, row) => (
            <div className="grid grid-cols-[1.3fr_1fr_0.8fr_0.5fr] gap-4 rounded-lg px-2 py-3" key={row}>
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-4/5" />
              <Bar className="h-4 w-3/4" />
              <Bar className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublicPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FCFAF7] px-5 py-6" aria-label="Loading Evalora" role="status">
      <span className="sr-only">Loading Evalora</span>
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <Bar className="h-12 w-36 bg-orange-100" />
          <Bar className="h-10 w-28" />
        </div>
        <div className="grid min-h-[75vh] items-center gap-10 py-16 lg:grid-cols-2">
          <div className="space-y-5">
            <Bar className="h-5 w-40 bg-orange-100" />
            <Bar className="h-12 w-full max-w-xl" />
            <Bar className="h-12 w-4/5" />
            <Bar className="h-4 w-full max-w-lg" />
            <Bar className="h-4 w-3/4" />
            <div className="flex gap-3 pt-3"><Bar className="h-12 w-36 bg-orange-100" /><Bar className="h-12 w-32" /></div>
          </div>
          <Bar className="aspect-[4/3] w-full rounded-3xl bg-orange-100/70" />
        </div>
      </div>
    </div>
  );
}

export function RouteSkeleton() {
  const { pathname } = useLocation();
  return pathname === '/' || pathname === '/login' ? <PublicPageSkeleton /> : <AppPageSkeleton />;
}
