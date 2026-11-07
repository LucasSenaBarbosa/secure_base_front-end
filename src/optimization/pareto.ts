import type { HomeLayout, Metrics, SensorPlacement, Solution } from './types';

const EPS = 1e-9;

/** `a` domina `b`: não é pior em nenhum objetivo e é estritamente melhor em ao menos um. */
export function dominates(a: Metrics, b: Metrics): boolean {
  const notWorse = a.coverage >= b.coverage - EPS && a.cost <= b.cost + EPS && a.vulnerability <= b.vulnerability + EPS;
  const better = a.coverage > b.coverage + EPS || a.cost < b.cost - EPS || a.vulnerability < b.vulnerability - EPS;
  return notWorse && better;
}

/**
 * Critérios para ordenar a fronteira. "Equilibrada" é o padrão do botão "Aplicar melhor opção":
 * primeiro as soluções que atingem o limiar de cobertura do layout, depois menor custo e menor
 * vulnerabilidade; sem nenhuma no limiar, vence a de maior cobertura.
 */
export type Criterion = 'balanced' | 'cost' | 'coverage' | 'vulnerability';

export const CRITERIA: { id: Criterion; label: string }[] = [
  { id: 'balanced', label: 'Equilibrada (limiar + menor custo)' },
  { id: 'cost', label: 'Menor custo' },
  { id: 'coverage', label: 'Maior cobertura' },
  { id: 'vulnerability', label: 'Menor vulnerabilidade' },
];

export interface SolutionFilter {
  minCoverage: number;
  maxCost: number | null;
}

export function filterSolutions(solutions: Solution[], filter: SolutionFilter): Solution[] {
  return solutions.filter((s) => (
    s.metrics.coverage >= filter.minCoverage - EPS
    && (filter.maxCost === null || s.metrics.cost <= filter.maxCost + EPS)
  ));
}

export function sortSolutions(solutions: Solution[], criterion: Criterion, coverageThreshold = 0): Solution[] {
  const key = (m: Metrics): number[] => {
    if (criterion === 'balanced') {
      const meets = m.coverage >= coverageThreshold - EPS;
      return meets ? [0, m.cost, m.vulnerability, -m.coverage] : [1, -m.coverage, m.cost, m.vulnerability];
    }
    if (criterion === 'cost') return [m.cost, -m.coverage, m.vulnerability];
    if (criterion === 'coverage') return [-m.coverage, m.vulnerability, m.cost];
    return [m.vulnerability, m.cost, -m.coverage];
  };
  return [...solutions].sort((a, b) => {
    const ka = key(a.metrics);
    const kb = key(b.metrics);
    for (let i = 0; i < ka.length; i += 1) {
      if (Math.abs(ka[i] - kb[i]) > EPS) return ka[i] - kb[i];
    }
    return a.index - b.index;
  });
}

/** A primeira solução pelo critério, respeitando os filtros; `null` se nenhuma passa. */
export function bestSolution(solutions: Solution[], criterion: Criterion, filter: SolutionFilter, coverageThreshold: number): Solution | null {
  return sortSolutions(filterSolutions(solutions, filter), criterion, coverageThreshold)[0] ?? null;
}

/** Valida localmente uma colocação antes de enviá-la — a API valida de novo. */
export function placementError(layout: HomeLayout, sensors: SensorPlacement[], next: SensorPlacement): string | null {
  const candidate = layout.candidate_points.find((c) => c.id === next.candidate_id);
  if (!candidate) return 'Ponto candidato inexistente.';
  if (!candidate.allowed_sensor_type_ids.includes(next.sensor_type_id)) {
    const type = layout.sensor_types.find((t) => t.id === next.sensor_type_id);
    return `${type?.name ?? next.sensor_type_id} não pode ser instalado em ${candidate.name}.`;
  }
  if (sensors.some((s) => s.candidate_id === next.candidate_id)) return `${candidate.name} já tem um sensor.`;
  return null;
}

export function placeSensor(sensors: SensorPlacement[], next: SensorPlacement): SensorPlacement[] {
  return [...sensors.filter((s) => s.candidate_id !== next.candidate_id), next];
}

export function moveSensor(sensors: SensorPlacement[], from: string, to: string): SensorPlacement[] {
  return sensors.map((s) => (s.candidate_id === from ? { ...s, candidate_id: to } : s));
}

export function removeSensor(sensors: SensorPlacement[], candidateId: string): SensorPlacement[] {
  return sensors.filter((s) => s.candidate_id !== candidateId);
}

/** Campos que a API exige antes de avaliar ou otimizar (espelha `missing_inputs`). */
export function missingInputs(layout: HomeLayout): string[] {
  const missing: string[] = [];
  if (layout.budget === null) missing.push('Orçamento');
  const used = new Set(layout.candidate_points.flatMap((c) => c.allowed_sensor_type_ids));
  for (const type of layout.sensor_types) {
    if (!used.has(type.id)) continue;
    if (type.unit_cost === null) missing.push(`Custo unitário — ${type.name}`);
    if (type.installation_cost === null) missing.push(`Custo de instalação — ${type.name}`);
  }
  return missing;
}

export const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
export const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (v: number, fmt: (n: number) => string) => (Math.abs(v) < EPS ? '=' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
