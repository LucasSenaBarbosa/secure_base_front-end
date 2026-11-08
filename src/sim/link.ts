/** Condição do enlace aplicada aos comandos enviados à casa; `null` no store significa enlace normal. */
export interface LinkCondition {
  label: string;
  loss: number;
  delayMs: number;
  /** A porta foi aberta ao aplicar o cenário e deve ser fechada ao encerrar. */
  doorOpened?: boolean;
}

export type LinkFate = { dropped: true } | { dropped: false; delayMs: number };

/** `roll` é um número em [0, 1); recebê-lo por parâmetro mantém a regra testável. */
export function linkFate(link: LinkCondition, roll: number): LinkFate {
  return roll < link.loss ? { dropped: true } : { dropped: false, delayMs: link.delayMs };
}
