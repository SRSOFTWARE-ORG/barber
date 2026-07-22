import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullRefresh({ onRefresh, threshold = 180 }: UsePullRefreshOptions) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (el && (window.scrollY <= 0 && el.scrollTop <= 0)) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    // Só conta como pull se for um arrasto consistente para baixo (>30px)
    if (diff > 30) {
      setPullDistance(Math.min((diff - 30) * 0.35, 220));
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pulling, pullDistance, threshold, refreshing, onRefresh]);

  const pullRefreshProps = {
    ref: containerRef,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  const PullIndicator = () => (
    (pullDistance > 10 || refreshing) ? (
      <div
        className="flex items-center justify-center transition-all duration-200 overflow-hidden"
        style={{ height: refreshing ? 48 : pullDistance > 10 ? pullDistance : 0 }}
      >
        <div className={`w-6 h-6 border-2 border-primary border-t-transparent rounded-full ${refreshing ? 'animate-spin' : ''}`}
          style={{ opacity: Math.min(pullDistance / threshold, 1), transform: `rotate(${pullDistance * 3}deg)` }}
        />
        {!refreshing && pullDistance >= threshold && (
          <span className="text-xs text-primary ml-2">Solte para atualizar</span>
        )}
      </div>
    ) : null
  );

  return { pullRefreshProps, PullIndicator, refreshing };
}
