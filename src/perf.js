// Central device/performance profile (M2 of MOBILE-PLAN). Phones get a lighter
// world: fewer terrain segments, particles, props and clouds; main.js also caps
// the pixel ratio and defaults bloom off. Desktop keeps the full experience.
export const IS_MOBILE =
  (typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches) ||
  (typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|IEMobile|Mobile/i.test(navigator.userAgent));

export const PERF = IS_MOBILE
  ? { terrainSeg: 96, particles: 450, scatter: 0.4, clouds: 6, grass: 750, fauna: 7, maxPixelRatio: 1.5 }
  : { terrainSeg: 140, particles: 900, scatter: 0.6, clouds: 9, grass: 2600, fauna: 12, maxPixelRatio: 2 };
