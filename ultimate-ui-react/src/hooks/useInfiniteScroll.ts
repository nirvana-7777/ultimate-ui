import { useEffect, useRef } from 'react';

export function useInfiniteScroll(
  callback: () => void,
  { enabled = true, rootMargin = '400px' }: { enabled?: boolean; rootMargin?: string } = {}
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) callback();
      },
      { root: null, rootMargin, threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [callback, enabled, rootMargin]);

  return sentinelRef;
}
