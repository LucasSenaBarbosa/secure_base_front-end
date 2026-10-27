import * as echarts from 'echarts';
import 'echarts-liquidfill';
import { useEffect, useRef } from 'react';

function useResizableChart() {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inst = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      inst.dispose();
      chart.current = null;
    };
  }, []);

  return { ref, chart };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function LiquidGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const { ref, chart } = useResizableChart();

  useEffect(() => {
    const inst = chart.current;
    if (!inst) return;
    const frac = clamp01(value / 100);
    const option = {
      series: [
        {
          type: 'liquidFill',
          radius: '92%',
          center: ['50%', '54%'],
          data: [frac, Math.max(0, frac - 0.07)],
          color: [color, `${color}55`],
          outline: { show: false },
          backgroundStyle: { color: 'rgba(255,255,255,0.045)' },
          amplitude: 5,
          waveAnimation: true,
          period: 3800,
          itemStyle: { shadowBlur: 0 },
          label: {
            formatter: () => `${Math.round(frac * 100)}%`,
            fontSize: 24,
            fontWeight: 700,
            color: '#f3f6ff',
            fontFamily: '"Space Grotesk", sans-serif',
          },
        },
      ],
    };
    (inst.setOption as (o: unknown, notMerge?: boolean) => void)(option, false);
  }, [value, color, chart]);

  return <div ref={ref} className="liquid-canvas" role="img" aria-label={`${label}: ${Math.round(value)}%`} />;
}

export function RadialGauge({ value, color }: { value: number; color: string }) {
  const { ref, chart } = useResizableChart();

  useEffect(() => {
    const inst = chart.current;
    if (!inst) return;
    const v = Math.round(clamp01(value / 100) * 100);
    const option: echarts.EChartsOption = {
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: '92%',
          center: ['50%', '58%'],
          progress: { show: true, width: 14, itemStyle: { color } },
          axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.08)']] } },
          pointer: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          anchor: { show: false },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            color: '#f3f6ff',
            fontSize: 24,
            fontWeight: 700,
            fontFamily: '"Space Grotesk", sans-serif',
            offsetCenter: [0, '0%'],
          },
          data: [{ value: v }],
        },
      ],
    };
    inst.setOption(option);
  }, [value, color, chart]);

  return <div ref={ref} className="gauge-canvas" role="img" aria-label={`${Math.round(value)}%`} />;
}

export interface TrendSeries {
  name: string;
  data: number[];
  color: string;
  unit?: string;
}

export function TrendChart({
  series,
  dual = false,
  markLine,
}: {
  series: TrendSeries[];
  dual?: boolean;
  markLine?: { value: number; label: string };
}) {
  const { ref, chart } = useResizableChart();

  useEffect(() => {
    const inst = chart.current;
    if (!inst) return;
    const n = Math.max(2, series[0]?.data.length ?? 2);
    const categories = Array.from({ length: n }, (_, i) => `${-Math.round((n - 1 - i) * 0.5)}s`);
    const pad = (arr: number[]) => (arr.length >= n ? arr : [...Array(n - arr.length).fill(arr[0] ?? 0), ...arr]);

    const yAxis: echarts.YAXisComponentOption[] = dual
      ? series.slice(0, 2).map((s, i) => ({
          type: 'value',
          position: i === 0 ? 'left' : 'right',
          splitLine: { show: i === 0, lineStyle: { color: '#1a2436' } },
          axisLabel: { color: s.color, fontSize: 10, formatter: `{value}${s.unit ?? ''}` },
          axisLine: { show: false },
        }))
      : [
          {
            type: 'value',
            splitLine: { lineStyle: { color: '#1a2436' } },
            axisLabel: { color: '#647890', fontSize: 10 },
            axisLine: { show: false },
          },
        ];

    const lineSeries: echarts.LineSeriesOption[] = series.map((s, i) => ({
      type: 'line',
      name: s.name,
      data: pad(s.data),
      yAxisIndex: dual ? i : 0,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: s.color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: `${s.color}55` },
          { offset: 1, color: `${s.color}00` },
        ]),
      },
      markLine:
        markLine && i === 0
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: '#ff6b7a', type: 'dashed' },
              label: { formatter: markLine.label, color: '#ffb3bd', fontSize: 10 },
              data: [{ yAxis: markLine.value }],
            }
          : undefined,
    }));

    const option: echarts.EChartsOption = {
      grid: { left: 38, right: dual ? 38 : 14, top: series.length > 1 ? 26 : 14, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10,14,26,0.92)',
        borderColor: '#2a3b55',
        textStyle: { color: '#e7eefc', fontSize: 11 },
      },
      legend: series.length > 1 ? { top: 0, textStyle: { color: '#8ea0bb', fontSize: 11 }, itemWidth: 14, itemHeight: 8 } : undefined,
      xAxis: {
        type: 'category',
        data: categories,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#243044' } },
        axisLabel: { color: '#647890', fontSize: 10, interval: Math.max(0, Math.ceil(n / 6) - 1) },
        axisTick: { show: false },
      },
      yAxis,
      dataZoom: [{ type: 'inside', throttle: 50 }],
      series: lineSeries,
      animationDuration: 260,
      animationEasing: 'linear',
    };
    inst.setOption(option);
  }, [series, dual, markLine, chart]);

  return <div ref={ref} className="chart-canvas" />;
}
