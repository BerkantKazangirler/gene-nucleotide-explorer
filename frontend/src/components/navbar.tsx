export const Navbar = ({ onHome }: { onHome: () => void }) => {
  return (
    <header className="w-full border-b border-line bg-sheet/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <button onClick={onHome} className="flex items-center gap-2.5 font-display font-extrabold text-lg tracking-tight">
          <Logo />
          ReFinder
        </button>
        <span className="text-sm text-ink-soft hidden sm:block">NCBI verileriyle gen haritası</span>
      </div>
    </header>
  );
};

/** Dört bazın renkleriyle küçük bir merdiven: logo. */
const Logo = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <rect x="1" y="2" width="20" height="3" rx="1.5" fill="var(--color-base-a)" />
    <rect x="4" y="7.5" width="14" height="3" rx="1.5" fill="var(--color-base-c)" />
    <rect x="4" y="13" width="14" height="3" rx="1.5" fill="var(--color-base-g)" />
    <rect x="1" y="18.5" width="20" height="3" rx="1.5" fill="var(--color-base-t)" />
  </svg>
);
