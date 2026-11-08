import { describe, expect, it } from 'vitest';
import { duration, houseEffect, linkConditionFrom, rate, verdictCopy } from './format';
import type { LinkMetrics, LinkSimulationDetail, Scenario } from './types';

const metrics = (patch: Partial<LinkMetrics>): LinkMetrics => ({
  delivery_rate: 1,
  aware_rate: 1,
  exposure_rate: 0,
  packet_loss: 0,
  latency_p50_ms: 80,
  latency_p95_ms: 120,
  jitter_ms: 4,
  aware_p50_ms: 80,
  local_alarm: false,
  verdict: 'delivered',
  ...patch,
});

const result = (patch: Partial<LinkMetrics>, scenario: Scenario = 'jamming') => (
  { scenario, metrics: metrics(patch) }
) as LinkSimulationDetail;

describe('formatação', () => {
  it('formata taxas e durações em pt-BR', () => {
    expect(rate(0.125)).toBe('12,5%');
    expect(duration(84.4)).toBe('84 ms');
    expect(duration(32_450)).toBe('32,5 s');
    expect(duration(null)).toBe('—');
  });
});

describe('verdictCopy', () => {
  it('fala de invasão nos cenários da casa', () => {
    expect(verdictCopy('silent', 'jamming').detail).toContain('invasão');
  });

  it('fala do código de acesso na antena falsa', () => {
    expect(verdictCopy('delivered', 'fake_base_station').title).toBe('Código entregue');
  });

  it('avisa quando o atacante leu o código', () => {
    expect(verdictCopy('silent', 'fake_base_station', 1).title).toBe('Atacante com o código da porta');
  });
});

describe('houseEffect', () => {
  it('abre a porta quando o código foi lido', () => {
    expect(houseEffect(result({ exposure_rate: 1 }, 'fake_base_station'))).toBe('open_door');
  });

  it('não faz nada na casa quando o código está protegido', () => {
    expect(houseEffect(result({ exposure_rate: 0 }, 'fake_base_station'))).toBe('none');
  });

  it('simula a passagem de alguém nos outros cenários', () => {
    expect(houseEffect(result({}, 'wan_failure'))).toBe('visitor');
  });
});

describe('linkConditionFrom', () => {
  it('usa entrega e latência calculadas pela API', () => {
    expect(linkConditionFrom(result({ delivery_rate: 0.75, latency_p50_ms: 200 }), 'x')).toEqual({ label: 'x', loss: 0.25, delayMs: 200, doorOpened: false });
  });

  it('corta o enlace quando nada foi entregue e lembra da porta aberta', () => {
    expect(linkConditionFrom(result({ delivery_rate: 0, latency_p50_ms: null, exposure_rate: 1 }, 'fake_base_station'), 'x')).toEqual({ label: 'x', loss: 1, delayMs: 0, doorOpened: true });
  });
});
