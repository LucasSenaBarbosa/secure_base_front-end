import type { LinkCondition } from '../sim/link';
import type { LinkSimulationDetail, Scenario, Verdict } from './types';

export interface VerdictCopy {
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'bad';
}

const INVASION: Record<Verdict, VerdictCopy> = {
  delivered: { title: 'Alerta entregue', detail: 'O morador foi avisado do movimento na casa.', tone: 'ok' },
  aware: { title: 'Alerta perdido, morador avisado', detail: 'O alerta não passou, mas o morador soube que a casa parou de responder.', tone: 'warn' },
  degraded: { title: 'Entrega instável', detail: 'Parte dos alertas não chegou nem gerou aviso.', tone: 'warn' },
  local_only: { title: 'Só a sirene tocou', detail: 'Quem está na casa ouve; quem está fora não fica sabendo da invasão.', tone: 'warn' },
  silent: { title: 'Falha silenciosa', detail: 'O morador não ficou sabendo da invasão.', tone: 'bad' },
};

const ACCESS_CODE: Record<Verdict, VerdictCopy> = {
  delivered: { title: 'Código entregue', detail: 'O código de acesso da porta chegou ao morador.', tone: 'ok' },
  aware: { title: 'Código perdido, morador avisado', detail: 'O código não chegou, mas o morador soube da falha.', tone: 'warn' },
  degraded: { title: 'Entrega instável', detail: 'Parte dos códigos não chegou ao morador.', tone: 'warn' },
  local_only: { title: 'Código perdido', detail: 'O morador não recebeu o código, e a sirene não ajuda neste ataque.', tone: 'warn' },
  silent: { title: 'Código perdido', detail: 'O morador não recebeu o código de acesso.', tone: 'bad' },
};

const CODE_STOLEN: VerdictCopy = {
  title: 'Atacante com o código da porta',
  detail: 'A antena falsa leu o código de acesso, e ele pode ser usado para entrar na casa.',
  tone: 'bad',
};

const MOST_TRIALS = 0.5;

export const isAccessCode = (scenario: Scenario): boolean => scenario === 'fake_base_station';

export function verdictCopy(verdict: Verdict, scenario: Scenario, exposureRate = 0): VerdictCopy {
  if (!isAccessCode(scenario)) return INVASION[verdict];
  return exposureRate >= MOST_TRIALS ? CODE_STOLEN : ACCESS_CODE[verdict];
}

export const rate = (value: number): string => `${(value * 100).toFixed(1).replace('.', ',')}%`;

export function duration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export type HouseEffect = 'open_door' | 'visitor' | 'none';

/** O que acontece na maquete quando o resultado é aplicado na casa. */
export function houseEffect(result: LinkSimulationDetail): HouseEffect {
  if (!isAccessCode(result.scenario)) return 'visitor';
  return result.metrics.exposure_rate >= MOST_TRIALS ? 'open_door' : 'none';
}

/** Traduz o resultado calculado pela API na condição que os comandos da casa vão sofrer. */
export function linkConditionFrom(result: LinkSimulationDetail, label: string): LinkCondition {
  return {
    label,
    loss: Math.min(1, Math.max(0, 1 - result.metrics.delivery_rate)),
    delayMs: result.metrics.latency_p50_ms ?? 0,
    doorOpened: houseEffect(result) === 'open_door',
  };
}
