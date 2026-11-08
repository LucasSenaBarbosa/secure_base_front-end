export type Scenario = 'baseline' | 'jamming' | 'wan_failure' | 'fake_base_station';
export type Defense = 'heartbeat' | 'local_siren' | 'sdwan_failover' | 'block_2g' | 'encrypted_push';
export type HopId = 'wifi' | 'wan' | 'backup_wan' | 'api' | 'mobile' | 'rogue_cell';
export type Generation = '2G' | '3G' | '4G' | '5G';
export type HopStatus = 'ok' | 'degraded' | 'down' | 'rogue';
export type Verdict = 'delivered' | 'aware' | 'degraded' | 'local_only' | 'silent';

export interface ScenarioInfo {
  id: Scenario;
  label: string;
  description: string;
  lessons: string[];
  relevant_defenses: Defense[];
}

export interface DefenseInfo {
  id: Defense;
  label: string;
  description: string;
  lessons: string[];
}

export interface LinkCatalog {
  model_version: string;
  notice: string;
  scenarios: ScenarioInfo[];
  defenses: DefenseInfo[];
}

export interface LinkSimulationRequest {
  scenario: Scenario;
  intensity: number;
  defenses: Defense[];
  fake_generation: Generation;
}

export interface HopReport {
  id: HopId;
  label: string;
  latency_ms: number;
  loss: number;
  status: HopStatus;
}

export interface LinkMetrics {
  delivery_rate: number;
  aware_rate: number;
  exposure_rate: number;
  packet_loss: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  jitter_ms: number | null;
  aware_p50_ms: number | null;
  local_alarm: boolean;
  verdict: Verdict;
}

export interface TimelineEvent {
  t_ms: number;
  kind: string;
  hop: HopId | null;
  message: string;
}

export interface LinkSimulationSummary {
  id: string;
  home_id: string;
  created_at: string;
  scenario: Scenario;
  intensity: number;
  defenses: Defense[];
  trials: number;
  seed: number;
  model_version: string;
  verdict: Verdict;
  delivery_rate: number;
}

export interface CellResult {
  id: 'real' | 'fake';
  label: string;
  generation: Generation;
  blocked: boolean;
  network_authenticated: boolean;
  identity_protected: boolean;
  content_protected: boolean;
  delivery_rate: number;
  exposure_rate: number;
  latency_p50_ms: number | null;
}

export interface LinkSimulationDetail extends LinkSimulationSummary {
  cells: CellResult[];
  fake_generation: Generation;
  generations: CellResult[];
  metrics: LinkMetrics;
  without_defenses: LinkMetrics;
  hops: HopReport[];
  timeline: TimelineEvent[];
}
