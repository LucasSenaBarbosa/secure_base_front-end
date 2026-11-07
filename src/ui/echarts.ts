/**
 * ECharts modular: registra só os gráficos e componentes que o app usa, em vez do pacote
 * completo (~1 MB). Ao usar um tipo de série ou componente novo, registre-o aqui.
 */
import { GaugeChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import 'echarts-liquidfill';

echarts.use([
  GaugeChart,
  LineChart,
  ScatterChart,
  DataZoomInsideComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
  CanvasRenderer,
]);

export { echarts };
export type ECharts = echarts.EChartsType;
export type { EChartsOption, LineSeriesOption, YAXisComponentOption } from 'echarts';
