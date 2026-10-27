import { useEffect, useRef } from 'react';

export function Spark({ values, color, min, max }: { values: number[]; color: string; min?: number; max?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const g = canvas.getContext('2d');
    if (!g || values.length < 2 || w < 2) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const span = hi - lo || 1;
    const xy = (v: number, i: number) => [(i / (values.length - 1)) * w, h - ((v - lo) / span) * (h - 6) - 3] as const;
    g.beginPath();
    values.forEach((v, i) => {
      const [x, y] = xy(v, i);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.stroke();
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = color;
    g.globalAlpha = 0.12;
    g.fill();
  }, [values, color, min, max]);
  return <canvas ref={ref} className="spark" />;
}

export function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'switch on' : 'switch'} onClick={onClick}>
      <i />
    </button>
  );
}
