import { describe, expect, it } from 'vitest';
import { cellPhases, type SceneInput } from './cellScene';

const input: SceneInput = { generation: '2G', active: true, blocked: false, encrypted: false, fakeDelivers: false };
const last = <T,>(items: T[]) => items[items.length - 1];

describe('cellPhases', () => {
  it('sem defesa, o SMS é lido, o morador fica sem o código e a porta abre', () => {
    const end = last(cellPhases(input));
    expect(end).toMatchObject({ link: 'fake', network: '2G', attacker: 'plain', phone: 'none', door: 'open' });
  });

  it('com push cifrado, o atacante não lê e a porta segue trancada, mas o código não chega', () => {
    expect(last(cellPhases({ ...input, encrypted: true }))).toMatchObject({ attacker: 'cipher', phone: 'none', door: 'locked' });
  });

  it('bloqueando 2G, o celular fica na verdadeira e recebe o código', () => {
    expect(last(cellPhases({ ...input, blocked: true }))).toMatchObject({ link: 'real', network: '5G', fake: 'refused', attacker: 'none', phone: 'code', door: 'locked' });
  });

  it('sem ataque, a antena falsa nem aparece', () => {
    const phases = cellPhases({ ...input, active: false });
    expect(phases.every((phase) => phase.fake === 'off')).toBe(true);
    expect(last(phases).phone).toBe('code');
  });

  it('usa o resultado da API para saber se o código passou pela falsa', () => {
    expect(last(cellPhases({ ...input, fakeDelivers: true })).phone).toBe('code');
  });

  it.each(['3G', '4G'] as const)('em %s o atacante só captura a identidade', (generation) => {
    const phases = cellPhases({ ...input, generation });
    expect(phases[2]).toMatchObject({ link: 'fake', network: generation, attacker: 'identity' });
    expect(last(phases)).toMatchObject({ link: 'real', network: '5G', fake: 'refused', attacker: 'identity', phone: 'code', door: 'locked' });
  });

  it('em 5G a identidade fica cifrada', () => {
    expect(last(cellPhases({ ...input, generation: '5G' }))).toMatchObject({ attacker: 'concealed', phone: 'code', door: 'locked' });
  });
});
