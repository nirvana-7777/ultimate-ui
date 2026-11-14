import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const NowContext = createContext<Date>(new Date());

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export function useNow(): Date {
  return useContext(NowContext);
}
