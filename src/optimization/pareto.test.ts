import { describe, expect, it } from 'vitest';
import {
  bestSolution,
  dominates,
  filterSolutions,
  missingInputs,
  moveSensor,
  placeSensor,
  placementError,
  removeSensor,
  signed,
  sortSolutions,
} from './pareto';
import type { HomeLayout, Metrics, Solution } from './types';

const m = (coverage: number, cost: number, vulnerability: number): Metrics => ({
  coverage, cost, vulnerability, sensor_count: 0, sensors_by_type: {},
});

const sol = (index: number, metrics: Metrics): Solution => ({ id: `s${index}`, index, sensors: [], metrics });

const layout: HomeLayout = {
  budget: 100,
  coverage_threshold: 0.8,
  rooms: [{ id: 'sala', name: 'Sala', glb_node: 'Sala', floor_y: 0, height: 1, min_xz: [0, 0], max_xz: [1, 1], visible_room_ids: [] }],
  critical_points: [{ id: 'p', name: 'Porta', room_id: 'sala', position: [0, 0, 0], importance: 5 }],
  candidate_points: [
    { id: 'teto', name: 'Teto', room_id: 'sala', position: [0, 1, 0], allowed_sensor_type_ids: ['pir'], extra_installation_cost: 0, direction: null },
    { id: 'batente', name: 'Batente', room_id: 'sala', position: [0, 0.5, 0], allowed_sensor_type_ids: ['vib', 'pir'], extra_installation_cost: 0, direction: null },
  ],
  sensor_types: [
    { id: 'pir', name: 'PIR', unit_cost: 10, installation_cost: 5, stock: 1, range: 1, field_of_view_deg: 110, reliability: 1 },
    { id: 'vib', name: 'Vibração', unit_cost: null, installation_cost: 2, stock: 1, range: 0.1, field_of_view_deg: 360, reliability: 1 },
    { id: 'sem-uso', name: 'Sem uso', unit_cost: null, installation_cost: null, stock: 0, range: 1, field_of_view_deg: 360, reliability: 1 },
  ],
};

describe('dominates', () => {
  it('exige ser melhor em pelo menos um objetivo sem piorar nenhum', () => {
    expect(dominates(m(0.8, 10, 0.2), m(0.7, 10, 0.2))).toBe(true);
    expect(dominates(m(0.8, 9, 0.2), m(0.8, 10, 0.2))).toBe(true);
    expect(dominates(m(0.8, 10, 0.2), m(0.8, 10, 0.2))).toBe(false);
    expect(dominates(m(0.9, 12, 0.1), m(0.8, 10, 0.2))).toBe(false);
  });
});

describe('ordenação e filtro pela escolha da pessoa usuária', () => {
  const front = [sol(0, m(0.5, 40, 0.4)), sol(1, m(1, 110, 0)), sol(2, m(0.78, 70, 0.2))];

  it('ordena por cada critério sem eleger um padrão', () => {
    expect(sortSolutions(front, 'cost').map((s) => s.index)).toEqual([0, 2, 1]);
    expect(sortSolutions(front, 'coverage').map((s) => s.index)).toEqual([1, 2, 0]);
    expect(sortSolutions(front, 'vulnerability').map((s) => s.index)).toEqual([1, 2, 0]);
  });

  it('filtra por cobertura mínima e custo máximo', () => {
    expect(filterSolutions(front, { minCoverage: 0.7, maxCost: null }).map((s) => s.index)).toEqual([1, 2]);
    expect(filterSolutions(front, { minCoverage: 0.7, maxCost: 100 }).map((s) => s.index)).toEqual([2]);
  });

  it('equilibrada: atinge o limiar com o menor custo; sem nenhuma no limiar, maior cobertura', () => {
    expect(sortSolutions(front, 'balanced', 0.75).map((s) => s.index)).toEqual([2, 1, 0]);
    expect(sortSolutions(front, 'balanced', 0.4).map((s) => s.index)).toEqual([0, 2, 1]);
    expect(sortSolutions([front[0], front[2]], 'balanced', 0.9).map((s) => s.index)).toEqual([2, 0]);
  });

  it('bestSolution respeita filtros e devolve null quando nada passa', () => {
    expect(bestSolution(front, 'balanced', { minCoverage: 0, maxCost: null }, 0.75)?.index).toBe(2);
    expect(bestSolution(front, 'balanced', { minCoverage: 0, maxCost: 60 }, 0.75)?.index).toBe(0);
    expect(bestSolution(front, 'cost', { minCoverage: 1.1, maxCost: null }, 0.75)).toBeNull();
  });

  it('não altera a lista original', () => {
    sortSolutions(front, 'coverage');
    expect(front.map((s) => s.index)).toEqual([0, 1, 2]);
  });
});

describe('edição da configuração manual', () => {
  it('só aceita tipos permitidos e um sensor por ponto', () => {
    expect(placementError(layout, [], { candidate_id: 'teto', sensor_type_id: 'vib' })).toMatch(/não pode ser instalado/);
    expect(placementError(layout, [], { candidate_id: 'nada', sensor_type_id: 'pir' })).toMatch(/inexistente/);
    const placed = [{ candidate_id: 'teto', sensor_type_id: 'pir' }];
    expect(placementError(layout, placed, { candidate_id: 'teto', sensor_type_id: 'pir' })).toMatch(/já tem/);
    expect(placementError(layout, placed, { candidate_id: 'batente', sensor_type_id: 'vib' })).toBeNull();
  });

  it('posiciona, move e remove mantendo um sensor por ponto', () => {
    let sensors = placeSensor([], { candidate_id: 'teto', sensor_type_id: 'pir' });
    sensors = placeSensor(sensors, { candidate_id: 'teto', sensor_type_id: 'pir' });
    expect(sensors).toHaveLength(1);
    sensors = moveSensor(sensors, 'teto', 'batente');
    expect(sensors).toEqual([{ candidate_id: 'batente', sensor_type_id: 'pir' }]);
    expect(removeSensor(sensors, 'batente')).toEqual([]);
  });
});

describe('missingInputs', () => {
  it('lista orçamento e custos vazios apenas dos tipos usados por candidatos', () => {
    expect(missingInputs(layout)).toEqual(['Custo unitário — Vibração']);
    expect(missingInputs({ ...layout, budget: null })).toContain('Orçamento');
  });
});

describe('signed', () => {
  it('formata diferenças com sinal ou igualdade', () => {
    expect(signed(0, String)).toBe('=');
    expect(signed(5, String)).toBe('+5');
    expect(signed(-5, String)).toBe('−5');
  });
});
