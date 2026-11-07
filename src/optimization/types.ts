/** Contratos da API de otimização (`/api/v1/homes/{home_id}/…`). */

export type Vec3 = [number, number, number];

export interface SensorType {
  id: string;
  name: string;
  unit_cost: number | null;
  installation_cost: number | null;
  stock: number;
  range: number;
  field_of_view_deg: number;
  reliability: number;
}

export interface Room {
  id: string;
  name: string;
  glb_node: string | null;
  floor_y: number;
  height: number;
  min_xz: [number, number];
  max_xz: [number, number];
  visible_room_ids: string[];
}

export interface CriticalPoint {
  id: string;
  name: string;
  room_id: string;
  position: Vec3;
  importance: number;
}

export interface CandidatePoint {
  id: string;
  name: string;
  room_id: string;
  position: Vec3;
  allowed_sensor_type_ids: string[];
  extra_installation_cost: number;
  direction: Vec3 | null;
}

export interface HomeLayout {
  budget: number | null;
  coverage_threshold: number;
  rooms: Room[];
  critical_points: CriticalPoint[];
  candidate_points: CandidatePoint[];
  sensor_types: SensorType[];
}

export interface LayoutDocument {
  home_id: string;
  source: 'saved' | 'template';
  version: number;
  updated_at: string | null;
  layout: HomeLayout;
}

export interface SensorPlacement {
  candidate_id: string;
  sensor_type_id: string;
}

export interface Metrics {
  coverage: number;
  cost: number;
  vulnerability: number;
  sensor_count: number;
  sensors_by_type: Record<string, number>;
}

export interface Violation {
  code: 'BUDGET_EXCEEDED' | 'STOCK_EXCEEDED';
  detail: string;
}

export interface PointCoverage {
  critical_point_id: string;
  detection_probability: number;
  covered: boolean;
}

export interface Evaluation {
  layout_version: number;
  metrics: Metrics;
  feasible: boolean;
  violations: Violation[];
  points: PointCoverage[];
}

export interface OptimizationRunRequest {
  population_size: number;
  generations: number;
  seed: number | null;
}

export interface Solution {
  id: string;
  index: number;
  sensors: SensorPlacement[];
  metrics: Metrics;
}

export interface SolutionDetail extends Solution {
  run_id: string;
  points: PointCoverage[];
}

export interface RunSummary {
  id: string;
  home_id: string;
  created_at: string;
  created_by: string | null;
  layout_version: number;
  algorithm: 'NSGA-II';
  library: string;
  population_size: number;
  generations: number;
  seed: number;
  evaluations: number;
  duration_ms: number;
  status: 'completed' | 'no_feasible_solution';
  solution_count: number;
}

export interface RunDetail extends RunSummary {
  layout: HomeLayout;
  solutions: Solution[];
}

export interface ManualConfiguration {
  id: string;
  home_id: string;
  name: string;
  sensors: SensorPlacement[];
  created_at: string;
  created_by: string | null;
  evaluation: Evaluation | null;
  evaluation_error: string | null;
}

export interface ComparisonEntry {
  solution_id: string;
  index: number;
  metrics: Metrics;
  delta_coverage: number;
  delta_cost: number;
  delta_vulnerability: number;
  solution_dominates_manual: boolean;
  manual_dominates_solution: boolean;
}

export interface Comparison {
  run_id: string;
  manual: Evaluation;
  manual_is_dominated: boolean;
  entries: ComparisonEntry[];
}
