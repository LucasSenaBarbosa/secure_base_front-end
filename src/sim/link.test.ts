import { describe, expect, it } from 'vitest';
import { linkFate } from './link';

const link = { label: 'teste', loss: 0.25, delayMs: 300 };

describe('linkFate', () => {
  it('descarta o comando quando o sorteio cai dentro da perda', () => {
    expect(linkFate(link, 0.1)).toEqual({ dropped: true });
  });

  it('entrega com atraso quando o sorteio cai fora da perda', () => {
    expect(linkFate(link, 0.25)).toEqual({ dropped: false, delayMs: 300 });
  });

  it('com perda total nunca entrega', () => {
    expect(linkFate({ ...link, loss: 1 }, 0.999)).toEqual({ dropped: true });
  });

  it('com perda zero sempre entrega', () => {
    expect(linkFate({ ...link, loss: 0 }, 0)).toEqual({ dropped: false, delayMs: 300 });
  });
});
