import type { ReactNode } from 'react';
import { Header } from './Header';
import { useLifecycleLog } from '@/lib/liveDebug';

export function Layout({ children }: { children: ReactNode }) {
  useLifecycleLog('Layout');
  return (
    <>
      <Header />
      <main className="content">{children}</main>
    </>
  );
}
