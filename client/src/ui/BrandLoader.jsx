export function BrandLoader({ fullScreen = true }) {
  return (
    <div
      className={[
        'grid place-items-center bg-[#FCFAF7]',
        fullScreen ? 'min-h-screen' : 'min-h-[320px]',
      ].join(' ')}
    >
      <div
        className="relative flex flex-col items-center gap-5"
        aria-label="Loading Evalora"
        role="status"
      >
        <div className="grid size-24 place-items-center rounded-[28px] bg-white/88 shadow-[0_22px_70px_rgba(255,122,0,0.14)] ring-1 ring-orange-100/80 backdrop-blur-xl">
          <img src="/logo.webp" alt="Evalora" className="w-20 object-contain" />
        </div>
        <div className="h-1.5 w-44 overflow-hidden rounded-full bg-orange-100" aria-hidden="true">
          <div className="h-full w-2/3 rounded-full bg-[#FF7A00] shadow-[0_0_20px_rgba(255,122,0,0.35)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
