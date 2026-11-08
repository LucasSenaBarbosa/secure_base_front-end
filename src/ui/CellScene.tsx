import { DoorClosed, DoorOpen, Eye, KeyRound, Lock, MessageSquareOff, RadioTower, RotateCcw, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cellPhases, type ScenePhase } from '../network/cellScene';
import { duration, rate } from '../network/format';
import type { CellResult, Generation, LinkSimulationDetail } from '../network/types';

const STEP_MS = 2200;

const ATTACKER: Record<Exclude<ScenePhase['attacker'], 'none'>, { icon: typeof Eye; text: string }> = {
  identity: { icon: Eye, text: 'Capturou a identidade do aparelho' },
  plain: { icon: Eye, text: 'Leu: “Seu código de acesso é 482913”' },
  cipher: { icon: Lock, text: 'Só vê dados cifrados' },
  concealed: { icon: Lock, text: 'Só recebeu a identidade cifrada (SUCI)' },
};

function Phone({ phase }: { phase: ScenePhase }) {
  return (
    <div className={`cell-phone ${phase.phone}`}>
      <div className="cell-phone-bar"><span>{phase.network}</span><Smartphone size={13} aria-hidden="true" /></div>
      <div className="cell-phone-screen">
        {phase.phone === 'code' && <><KeyRound size={24} /><b>482913</b><small>Código da porta</small></>}
        {phase.phone === 'none' && <><MessageSquareOff size={24} /><b>Sem código</b><small>Nada chegou</small></>}
        {phase.phone === 'idle' && <small>Tudo normal</small>}
      </div>
    </div>
  );
}

function Scene({ phase, generation }: { phase: ScenePhase; generation: Generation }) {
  const attacker = phase.attacker === 'none' ? null : ATTACKER[phase.attacker];
  return (
    <div className="cell-scene">
      <div className="cell-tower real">
        <RadioTower size={38} aria-hidden="true" />
        <b>Antena verdadeira</b>
        <small>5G · operadora</small>
      </div>
      <div className={`cell-beam real${phase.link === 'real' ? ' on' : ''}`} aria-hidden="true"><i /></div>
      <Phone phase={phase} />
      <div className={`cell-beam fake${phase.link === 'fake' ? ' on' : ''}${phase.fake === 'refused' ? ' cut' : ''}`} aria-hidden="true"><i /></div>
      <div className={`cell-tower fake ${phase.fake}`}>
        <RadioTower size={38} aria-hidden="true" />
        <b>Antena falsa</b>
        <small>{phase.fake === 'refused' ? 'Recusada pelo celular' : `${generation} · atacante`}</small>
        {attacker && <p className="cell-attacker"><attacker.icon size={13} aria-hidden="true" /> {attacker.text}</p>}
      </div>
      <div className={`cell-door ${phase.door}`}>
        {phase.door === 'open' ? <DoorOpen size={16} aria-hidden="true" /> : <DoorClosed size={16} aria-hidden="true" />}
        {phase.door === 'open' ? 'Porta aberta pelo atacante' : 'Porta da casa trancada'}
      </div>
    </div>
  );
}

function CellCard({ cell }: { cell: CellResult }) {
  const yesNo = (good: boolean, yes: string, no: string) => <span className={good ? 'good' : 'bad'}>{good ? yes : no}</span>;
  const refused = cell.id === 'fake' && cell.blocked;
  const detected = cell.id === 'fake' && !cell.blocked && cell.network_authenticated;
  return (
    <article className={`cell-card ${cell.id}`}>
      <header>
        {cell.id === 'real' || refused ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />}
        <h4>{cell.id === 'real' ? 'Na antena verdadeira' : `Na antena falsa (${cell.generation})`}</h4>
      </header>
      {refused ? <p className="cell-refused">O celular recusou o 2G e nunca se conectou a ela. O código seguiu pela antena verdadeira.</p> : (
        <dl>
          <div><dt>Conexão</dt><dd>{detected ? 'recusada' : cell.generation}</dd></div>
          <div><dt>Celular exige prova da antena</dt><dd>{yesNo(cell.network_authenticated, 'sim', 'não')}</dd></div>
          <div><dt>Identidade do aparelho</dt><dd>{yesNo(cell.identity_protected, 'protegida', 'exposta')}</dd></div>
          <div><dt>Código de acesso</dt><dd>{yesNo(cell.content_protected, 'protegido', 'legível')}</dd></div>
          <div><dt>Códigos entregues</dt><dd>{rate(cell.delivery_rate)}</dd></div>
          <div><dt>Tempo de entrega</dt><dd>{duration(cell.latency_p50_ms)}</dd></div>
        </dl>
      )}
    </article>
  );
}

function GenerationTable({ rows, selected }: { rows: CellResult[]; selected: Generation }) {
  const mark = (good: boolean, text: string) => <span className={good ? 'good' : 'bad'}>{text}</span>;
  return (
    <div className="cell-table-wrap">
      <h4>A antena falsa em cada geração</h4>
      <table className="net-table cell-table">
        <thead><tr><th scope="col">Geração</th><th scope="col">Detecta a falsa</th><th scope="col">Identidade</th><th scope="col">Código</th><th scope="col">Porta</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.generation} className={row.generation === selected ? 'on' : ''}>
              <th scope="row">{row.generation}</th>
              <td>{mark(row.network_authenticated, row.blocked ? 'bloqueada' : row.network_authenticated ? 'sim' : 'não')}</td>
              <td>{mark(row.identity_protected, row.identity_protected ? 'protegida' : 'exposta')}</td>
              <td>{mark(row.content_protected, row.content_protected ? 'protegido' : 'legível')}</td>
              <td>{mark(row.exposure_rate < 0.5, row.exposure_rate < 0.5 ? 'segura' : 'em risco')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CellAttack({ result }: { result: LinkSimulationDetail }) {
  const fake = result.cells.find((cell) => cell.id === 'fake');
  const generation = result.fake_generation ?? '2G';
  const phases = useMemo(() => cellPhases({
    generation,
    active: result.intensity > 0,
    blocked: generation === '2G' && result.defenses.includes('block_2g'),
    encrypted: result.defenses.includes('encrypted_push'),
    fakeDelivers: (fake?.delivery_rate ?? 0) >= 0.5,
  }), [generation, result.intensity, result.defenses, fake?.delivery_rate]);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    setStep(0);
    const timer = setInterval(() => setStep((value) => {
      if (value >= phases.length - 1) clearInterval(timer);
      return Math.min(phases.length - 1, value + 1);
    }), STEP_MS);
    return () => clearInterval(timer);
  }, [result.id, replay, phases.length]);

  const phase = phases[Math.min(step, phases.length - 1)];

  return (
    <section className="net-card">
      <div className="net-card-head">
        <h3>Ataque ao celular</h3>
        <button className="opt-mini" onClick={() => setReplay((n) => n + 1)}><RotateCcw size={12} /> Repetir</button>
      </div>
      <Scene phase={phase} generation={generation} />
      <p className="cell-caption" aria-live="polite"><b>{step + 1}/{phases.length}</b> {phase.caption}</p>
      <div className="cell-cards">
        {result.cells.map((cell) => <CellCard key={cell.id} cell={cell} />)}
      </div>
      {result.generations?.length > 0 && <GenerationTable rows={result.generations} selected={generation} />}
    </section>
  );
}
