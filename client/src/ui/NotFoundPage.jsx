import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <div className="panel max-w-md p-7 text-center">
        <img src="/logo.webp" alt="Evalora" className="mx-auto h-16 w-40 object-contain" />
        <h1 className="mt-6 text-2xl font-semibold text-slate-950">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The requested Evalora route is not available.</p>
        <Link className="primary-button mt-6" to="/login">
          Back to login
        </Link>
      </div>
    </main>
  );
}
