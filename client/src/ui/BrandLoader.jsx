export function BrandLoader({ fullScreen = true }) {
  return (
    <div className={`brand-loader ${fullScreen ? 'min-h-screen' : 'min-h-[320px]'}`}>
      <div className="brand-loader-mark" aria-label="Loading Evalora">
        <img src="/logo.webp" alt="Evalora" className="brand-loader-logo-image" />
        <div className="brand-loader-dots" aria-hidden="true">
          <span className="brand-loader-dot brand-loader-dot-1" />
          <span className="brand-loader-dot brand-loader-dot-2" />
          <span className="brand-loader-dot brand-loader-dot-3" />
        </div>
      </div>
    </div>
  );
}
