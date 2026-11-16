import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export interface PlayerState {
  url: string;
  title: string;
  subtitle?: string;
}

interface Props {
  state: PlayerState | null;
  onClose: () => void;
}

/**
 * Two refs, two purposes:
 *   - shakaRef: the shaka namespace, populated once by the dynamic import
 *   - playerRef: the shaka.Player instance for the currently-loaded stream
 *
 * These must NOT share a ref. Keeping them together caused the second
 * play() call to fall through to native <video> because effect 2 runs
 * synchronously on state change, before the async import has re-populated
 * the namespace ref.
 *
 * Additional invariants (review, set 6):
 *   - destroyPlayer() nulls playerRef BEFORE starting the async destroy and
 *     records the promise; the next init() awaits it so a new shaka.Player
 *     never attaches to a video element still owned by the previous one
 *     (shaka-player#1004: "the video element is owned by the Player
 *     instance until destroy() is resolved").
 *   - An init() that was cancelled after load() only clears/nulls the ref
 *     when it still points at ITS OWN instance — a stale init must never
 *     untrack the next player's ref.
 *   - minimize hides .player-content via CSS (display: none). The <video>
 *     element is never unmounted mid-playback: audio keeps running and
 *     the playhead survives restore. (Unmounting left playerRef pointing
 *     at a detached element with nothing re-attaching on restore.)
 *   - If shaka fails to load the stream, we fall back to video.src —
 *     native <video> still plays HLS in Safari and plain files elsewhere.
 */
export function FloatingPlayer({ state, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shakaRef = useRef<any>(null); // shaka namespace
  const playerRef = useRef<any>(null); // shaka.Player instance
  const destroyPromiseRef = useRef<Promise<void> | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [shakaReady, setShakaReady] = useState(false);
  const reduced = useReducedMotion();

  // TEMP DEBUG ([live-debug]): trace what happens on "Live ansehen".
  useEffect(() => {
    console.info('[live-debug] FloatingPlayer state ->', state ? state.url : null);
    if (!state) return;
    // Report if the player DOM is removed from the document by anything.
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.removedNodes.forEach((n) => {
          if (
            n instanceof Element &&
            (n.matches('.floating-player, video') || n.querySelector('.floating-player, video'))
          ) {
            const t = m.target as Element;
            console.info(
              '[live-debug] REMOVED',
              n.tagName + '.' + n.className,
              'from',
              t.tagName + '.' + t.className
            );
          }
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const probe = (label: string) => () => {
      const vid = videoRef.current;
      const fp = document.querySelector('.floating-player') as HTMLElement | null;
      console.info(
        '[live-debug] ' + label,
        JSON.stringify({
          videoRefConnected: vid ? vid.isConnected : null,
          sameDocument: vid ? vid.ownerDocument === document : null,
          inIframe: window.top !== window,
          fpCount: document.querySelectorAll('.floating-player').length,
          videoCount: document.querySelectorAll('video').length,
          paused: vid ? vid.paused : null,
          muted: vid ? vid.muted : null,
          readyState: vid ? vid.readyState : null,
          currentTime: vid ? vid.currentTime : null,
          opacity: fp ? getComputedStyle(fp).opacity : null,
          rect: fp ? fp.getBoundingClientRect().toJSON() : null,
          rootChildren: document.getElementById('root')?.children.length ?? null,
        })
      );
    };
    const t1 = setTimeout(probe('+1.5s'), 1500);
    const t2 = setTimeout(probe('+5s'), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
    };
  }, [state]);

  // Load shaka lazily the first time the player mounts. Keeps the main
  // bundle small (shaka is ~800 KB raw) and makes it optional — a user
  // who never plays a stream never downloads it.
  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('shaka-player/dist/shaka-player.compiled');
        if (!cancelled) {
          shakaRef.current = mod.default; // namespace, NOT instance
          setShakaReady(true);
        }
      } catch (e) {
        console.error('Failed to load shaka-player:', e);
        if (!cancelled) setShakaReady(true); // proceed with native <video>
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Play when a new state arrives AND shaka has had a chance to load.
  // NOTE: keys on `state` object identity. Callers must set a NEW object
  // per play action (EPGPage does — setPlayer runs only inside event
  // handlers), never re-derive it during render, or playback restarts.
  useEffect(() => {
    if (!state || !videoRef.current || !shakaReady) return;
    const video = videoRef.current;
    const shaka = shakaRef.current; // namespace
    let cancelled = false;

    // Tear down the current instance. unload()/destroy() reject
    // asynchronously, so .catch — a try/catch around the call catches
    // nothing. The promise is recorded so the next init() can wait for
    // the video element to be fully released.
    const destroyPlayer = () => {
      const player = playerRef.current;
      playerRef.current = null;
      if (player?.destroy) {
        try {
          destroyPromiseRef.current = player.destroy().catch(() => {});
        } catch {}
      }
    };

    const isAdaptiveUrl = (url: string) => {
      try {
        const pathname = new URL(url, window.location.href).pathname;
        return pathname.endsWith('.mpd') || pathname.endsWith('.m3u8');
      } catch {
        return url.includes('.mpd') || url.includes('.m3u8');
      }
    };

    const init = async () => {
      // Wait out any in-flight destroy from the previous play so the
      // video element is fully released before a new Player attaches.
      await destroyPromiseRef.current;
      if (cancelled) return;

      if (shaka?.Player && isAdaptiveUrl(state.url)) {
        try {
          const player = new shaka.Player(video);
          player.configure({
            streaming: { bufferingGoal: 30, rebufferingGoal: 2 },
          });
          playerRef.current = player; // instance, not namespace
          console.info('[live-debug] shaka load start');
          await player.load(state.url);
          console.info('[live-debug] shaka load done, cancelled =', cancelled);
          if (!cancelled) {
            // shaka's load() never starts playback by itself (the native
            // path below calls play() explicitly). Autoplay can still be
            // refused by the browser; the controls stay available then.
            try {
              console.info('[live-debug] play() call');
              await video.play();
              console.info('[live-debug] play() resolved');
            } catch (e) {
              console.info('[live-debug] play() rejected', (e as any)?.name);
              // Safari (and Chrome when the click is too old) refuse
              // unmuted autoplay once async work has passed since the
              // click. Muted autoplay is always allowed: start muted and
              // let the user unmute via the controls.
              if (!cancelled && (e as any)?.name === 'NotAllowedError') {
                console.warn('[player] autoplay refused, starting muted');
                video.muted = true;
                try {
                  await video.play();
                } catch {}
              }
            }
          }
          if (cancelled) {
            // Only untrack OUR instance — a newer init may have already
            // installed its own. The effect cleanup's destroyPlayer()
            // may already have destroyed us; double-destroy is caught.
            if (playerRef.current === player) {
              playerRef.current = null;
            }
            try {
              player.destroy()?.catch(() => {});
            } catch {}
          }
        } catch (e) {
          console.error('Shaka load error', e);
          if (!cancelled) {
            // Shaka could not load it (unsupported browser, bad manifest):
            // fall back to native <video> — Safari still plays HLS.
            video.src = state.url;
            try {
              await video.play();
            } catch {}
          }
        }
      } else {
        video.src = state.url;
        try {
          await video.play();
        } catch {
          // autoplay blocked; user has controls
        }
      }
    };

    console.info('[live-debug] init() start, shakaReady =', shakaReady);
    init();

    return () => {
      console.info('[live-debug] init cleanup (effect re-ran or unmounted)');
      cancelled = true;
      destroyPlayer();
      if (video.src) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [state, shakaReady]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          className="floating-player"
          initial={reduced ? false : { opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: 100 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onAnimationStart={() => console.info('[live-debug] enter animation start')}
          onAnimationComplete={() => console.info('[live-debug] animation complete')}
          drag={!minimized}
          dragMomentum={false}
          dragElastic={0.05}
          style={{ cursor: 'default' }}
        >
          <div className="player-header">
            <h4>{state.title}</h4>
            <div className="player-controls">
              <button
                className="player-minimize"
                onClick={() => setMinimized((v) => !v)}
                aria-label="Minimieren"
              >
                {minimized ? '□' : '−'}
              </button>
              <button
                className="player-close"
                onClick={onClose}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
          </div>
          {/* Never unmount the <video> for minimize — display:none keeps
              playback running and the element alive for shaka. */}
          <div
            className={
              minimized ? 'player-content player-content--hidden' : 'player-content'
            }
          >
            <video ref={videoRef} id="floating-video" controls playsInline />
            <div className="player-info">
              <div className="player-info-title">{state.title}</div>
              {state.subtitle && (
                <div className="player-info-subtitle">{state.subtitle}</div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
