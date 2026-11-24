// The seeded generator both sides of the golden vectors use.

import { f } from "../src/ShipMapData.ts";
import type { Rng } from "../src/ShipMap.ts";

/** mulberry32, as golden/UnityStubs.cs's UnityEngine.Random. */
export function seeded(seed: number): Rng {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    get value() {
      return f(next());
    },
    Range: (min, max) => min + (max - min) * next(),
    RangeInt: (min, max) => (max > min ? min + Math.floor(next() * (max - min)) : min),
  };
}
