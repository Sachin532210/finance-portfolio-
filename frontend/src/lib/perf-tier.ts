/**
 * Device capability tiering.
 *
 * Liquid Glass is genuinely expensive. Every `backdrop-filter` is a backdrop
 * root: the compositor has to read back everything painted behind the element,
 * blur it, and composite the result - per element, per frame that it changes.
 * A dashboard with twenty glass cards is twenty of those. On an Adreno 610 or
 * Mali-G52 (Vivo S1 class) that does not fit in a 16ms budget, and no amount
 * of tuning the CSS changes that; the work is real.
 *
 * So the material is tiered rather than compromised. Capable hardware gets the
 * full thing. Weaker hardware gets the same palette, geometry, type and motion
 * with the blur swapped for a more opaque fill - which is exactly what iOS
 * itself does under Reduce Transparency, and why that setting exists.
 *
 * Two signals, because neither alone is reliable:
 *
 *   1. A static guess from what the device reports, so the first frame is
 *      already correct rather than janking and then fixing itself.
 *   2. A frame-time probe, because the static guess is only a guess - a phone
 *      can report eight cores and still be thermally throttled, and a laptop
 *      can be on battery saver.
 */

export type PerfTier = "high" | "low";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

function staticGuess(): PerfTier {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as NavigatorWithHints;

  // Chrome rounds deviceMemory down to a power of two, so both the 4GB and
  // 6GB Vivo S1 report 4. Either way it lands in the low tier, which is right.
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  if (nav.connection?.saveData) return "low";
  if (memory <= 4 || cores <= 4) return "low";
  // A touch device with mid RAM is a phone, and phone GPUs are far weaker
  // than their core count suggests.
  if (coarse && memory <= 6) return "low";
  return "high";
}

function apply(tier: PerfTier) {
  document.documentElement.dataset.perf = tier;
}

/**
 * Watches real frame times and drops a tier if the device cannot hold them.
 *
 * Deliberately measured over a couple of seconds of actual use rather than a
 * synthetic benchmark: a benchmark measures the benchmark, and the thing that
 * matters is whether THIS page composites smoothly on THIS device right now.
 */
function watchFrames(onStruggle: () => void) {
  const SAMPLE = 100;
  const frames: number[] = [];
  let last = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    const delta = now - last;
    last = now;

    // Only count frames the document was actually painting. A hidden tab, a
    // backgrounded window, or a host that does not composite all produce rAF
    // gaps indistinguishable from a struggling GPU - and treating those as
    // evidence pins a fast machine to the low tier for the whole session.
    if (!document.hidden && delta > 0 && delta < 500) frames.push(delta);

    if (frames.length >= SAMPLE) {
      frames.sort((a, b) => a - b);
      // 90th percentile, not the mean: a smooth run with a few long frames is
      // what feels bad, and an average hides exactly that.
      const p90 = frames[Math.floor(frames.length * 0.9)];
      if (p90 > 22) onStruggle();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function initPerfTier(): PerfTier {
  const tier = staticGuess();
  apply(tier);

  if (tier === "high") {
    // Give the app a moment to settle so first-load work is not mistaken for
    // a slow device.
    // Two independent bad windows before acting. A single one is as likely to
    // be a slow network response or a background tab as a slow device, and
    // downgrading is visible - it should not happen on one noisy sample.
    let strikes = 0;
    const round = () => {
      watchFrames(() => {
        strikes += 1;
        if (strikes >= 2) apply("low");
        else window.setTimeout(round, 2000);
      });
    };
    window.setTimeout(round, 1800);
  }

  return tier;
}
