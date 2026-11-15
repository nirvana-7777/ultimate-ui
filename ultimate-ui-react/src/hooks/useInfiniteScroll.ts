import { useEffect, useRef, type RefObject } from 'react';

export function useInfiniteScroll(
  callback: () => void,
  {
    enabled = true,
    rootMargin = '400px',
    rootRef,
  }: {
    enabled?: boolean;
    rootMargin?: string;
    /** Scroll container to observe against; defaults to the viewport. */
    rootRef?: RefObject<Element | null>;
  } = {}
) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) callback();
      },
      { root: rootRef?.current ?? null, rootMargin, threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [callback, enabled, rootMargin, rootRef]);

  return sentinelRef;
}
