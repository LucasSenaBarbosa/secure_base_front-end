import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { useSim } from '../sim/store';

type SimState = ReturnType<typeof useSim.getState>;

/** Store selector that refreshes the React tree at most every `ms`. */
export function useThrottled<T>(selector: (s: SimState) => T, ms = 200): T {
  const sel = useRef(selector);
  sel.current = selector;
  const [value, setValue] = useState(() => selector(useSim.getState()));
  useEffect(() => {
    let last = 0;
    let pending: number | undefined;
    const pull = () => {
      pending = undefined;
      last = performance.now();
      const next = sel.current(useSim.getState());
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    const unsub = useSim.subscribe(() => {
      const now = performance.now();
      if (now - last >= ms) pull();
      else if (pending === undefined) pending = window.setTimeout(pull, ms - (now - last));
    });
    return () => {
      unsub();
      if (pending !== undefined) window.clearTimeout(pending);
    };
  }, [ms]);
  return value;
}

/** Anima um número até o valor alvo com GSAP — usado nos cartões premium da Telemetria. */
export function useAnimatedNumber(value: number, decimals = 0): string {
  const [display, setDisplay] = useState(value);
  const obj = useRef({ v: value });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      obj.current.v = value;
      setDisplay(value);
      return;
    }
    const tween = gsap.to(obj.current, {
      v: value,
      duration: 0.65,
      ease: 'power2.out',
      onUpdate: () => setDisplay(obj.current.v),
    });
    return () => { tween.kill(); };
  }, [value]);
  return decimals ? display.toFixed(decimals) : String(Math.round(display));
}

export function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
