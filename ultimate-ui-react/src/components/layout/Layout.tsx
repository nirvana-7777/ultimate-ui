import { ReactNode, useState, useEffect } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileOverlay } from './MobileOverlay';

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <>
      <button
        className="mobile-menu-toggle"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Menu öffnen"
      >
        <span className="hamburger" />
        <span className="hamburger" />
        <span className="hamburger" />
      </button>
      <Header />
      <div className="main-container">
        <Sidebar
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />
        <main className="content">{children}</main>
      </div>
      <MobileOverlay active={mobileOpen} onClick={() => setMobileOpen(false)} />
    </>
  );
}
