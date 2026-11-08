import type { Generation } from './types';

export interface ScenePhase {
  caption: string;
  link: 'real' | 'fake';
  fake: 'off' | 'on' | 'refused';
  network: Generation;
  phone: 'idle' | 'code' | 'none';
  attacker: 'none' | 'identity' | 'plain' | 'cipher' | 'concealed';
  door: 'locked' | 'open';
}

export interface SceneInput {
  /** Geração usada pela antena falsa. */
  generation: Generation;
  /** Intensidade maior que zero: a antena falsa chega a ligar. */
  active: boolean;
  blocked: boolean;
  encrypted: boolean;
  /** A maioria dos códigos chega mesmo com o celular preso à antena falsa. */
  fakeDelivers: boolean;
}

const connected: ScenePhase = {
  caption: 'O celular está na antena verdadeira, em 5G, com rede e aparelho autenticados.',
  link: 'real', fake: 'off', network: '5G', phone: 'idle', attacker: 'none', door: 'locked',
};

/** Roteiro da cena; os números exibidos ao lado dela vêm da API. */
export function cellPhases({ generation, active, blocked, encrypted, fakeDelivers }: SceneInput): ScenePhase[] {
  const delivered: ScenePhase = { ...connected, phone: 'code', caption: 'O código de acesso da porta chega só ao morador, pela antena verdadeira.' };
  if (!active) return [connected, delivered];

  const appears: ScenePhase = { ...connected, fake: 'on', caption: `Uma antena falsa ${generation} liga por perto, com sinal mais forte que o da verdadeira.` };
  if (blocked) {
    return [
      connected,
      appears,
      { ...appears, fake: 'refused', caption: 'A antena falsa tenta rebaixar a conexão, mas o celular recusa o 2G e fica onde está.' },
      { ...delivered, fake: 'refused' },
    ];
  }

  if (generation !== '2G') {
    const concealed = generation === '5G';
    const attacker = concealed ? 'concealed' : 'identity';
    const contacted: ScenePhase = {
      ...appears, link: 'fake', network: generation, attacker,
      caption: concealed
        ? 'O celular tenta se conectar em 5G, mas só entrega a identidade cifrada (SUCI).'
        : `O celular tenta se conectar em ${generation}, e a antena falsa captura a identidade do aparelho antes da autenticação.`,
    };
    const rejected: ScenePhase = {
      ...contacted, link: 'real', network: '5G', fake: 'refused',
      caption: `Em ${generation}, a rede precisa provar quem é. A antena falsa não consegue, e o celular volta para a verdadeira.`,
    };
    return [connected, appears, contacted, rejected, {
      ...rejected, phone: 'code',
      caption: concealed ? 'O código chega ao morador, e o atacante fica sem nada útil.' : 'O código chega ao morador. O atacante ficou só com a identidade do aparelho.',
    }];
  }

  const captured: ScenePhase = {
    ...appears, link: 'fake', network: '2G', attacker: 'identity',
    caption: 'O celular cai para 2G na antena falsa. Nessa geração ele não verifica a rede, e a identidade do aparelho fica exposta.',
  };
  const intercepted: ScenePhase = encrypted
    ? { ...captured, attacker: 'cipher', caption: 'O código chega à antena falsa cifrado: o atacante não consegue ler.' }
    : { ...captured, attacker: 'plain', caption: 'O código de acesso vai por SMS, e a antena falsa lê o texto inteiro.' };
  const ending: ScenePhase = fakeDelivers
    ? { ...intercepted, phone: 'code', caption: 'O código chega ao morador, mesmo passando pela antena falsa.' }
    : { ...intercepted, phone: 'none', caption: 'A antena falsa não repassa a mensagem à rede real: o morador fica sem o código.' };
  if (encrypted) return [connected, appears, captured, intercepted, ending];
  return [connected, appears, captured, intercepted, ending, { ...ending, door: 'open', caption: 'Com o código nas mãos, o atacante abre a porta da casa.' }];
}
