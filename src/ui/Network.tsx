import { Globe, Home, Play, Radio, RotateCcw, Smartphone, Wifi, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CellAttack } from './CellScene';
import { duration, houseEffect, isAccessCode, linkConditionFrom, rate, verdictCopy } from '../network/format';
import { useNetwork } from '../network/store';
import type { Defense, Generation, HopId, HopReport, LinkMetrics, LinkSimulationDetail, ScenarioInfo } from '../network/types';
import { useSim } from '../sim/store';

const STEP_MS = 600;
const GENERATIONS: Generation[] = ['2G', '3G', '4G', '5G'];

const STATUS_LABEL: Record<HopReport['status'], string> = {
  ok: 'normal',
  degraded: 'degradado',
  down: 'fora do ar',
  rogue: 'atacante',
};

function Node({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="net-node">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Link({ hop, active }: { hop: HopReport; active: boolean }) {
  return (
    <div className={`net-link ${hop.status}${active ? ' on' : ''}`}>
      <span className="net-link-label">{hop.label}</span>
      <i aria-hidden="true" />
      <small>{STATUS_LABEL[hop.status]} · {duration(hop.latency_ms)} · perda {rate(hop.loss)}</small>
    </div>
  );
}

function PathDiagram({ result, activeHop }: { result: LinkSimulationDetail; activeHop: HopId | null }) {
  const hop = (id: HopId) => result.hops.find((item) => item.id === id);
  const links = (ids: HopId[]) => (
    <div className="net-links">
      {ids.map((id) => {
        const report = hop(id);
        return report ? <Link key={id} hop={report} active={activeHop === id} /> : null;
      })}
    </div>
  );
  return (
    <div className="net-path">
      <Node icon={<Radio size={20} />} label="ESP32" />
      {links(['wifi'])}
      <Node icon={<Home size={20} />} label="Roteador" />
      {links(['wan', 'backup_wan'])}
      <Node icon={<Globe size={20} />} label="Internet" />
      {links(['mobile', 'rogue_cell'])}
      <Node icon={<Smartphone size={20} />} label="Celular" />
    </div>
  );
}

function Comparison({ withDefenses, without, subject }: { withDefenses: LinkMetrics; without: LinkMetrics; subject: string }) {
  const rows: [string, (m: LinkMetrics) => string][] = [
    [`${subject} entregue`, (m) => rate(m.delivery_rate)],
    ['Morador ciente', (m) => rate(m.aware_rate)],
    ['Tempo até saber (mediana)', (m) => duration(m.aware_p50_ms)],
    ['Conteúdo exposto', (m) => rate(m.exposure_rate)],
    ['Perda por tentativa', (m) => rate(m.packet_loss)],
    ['Latência p50', (m) => duration(m.latency_p50_ms)],
    ['Latência p95', (m) => duration(m.latency_p95_ms)],
    ['Jitter', (m) => duration(m.jitter_ms)],
    ['Sirene local', (m) => (m.local_alarm ? 'sim' : 'não')],
  ];
  return (
    <table className="net-table">
      <thead><tr><th scope="col">Métrica</th><th scope="col">Sem defesas</th><th scope="col">Com as defesas</th></tr></thead>
      <tbody>
        {rows.map(([label, read]) => (
          <tr key={label}><th scope="row">{label}</th><td>{read(without)}</td><td>{read(withDefenses)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Result({ result, scenario }: { result: LinkSimulationDetail; scenario: ScenarioInfo | undefined }) {
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const link = useSim((s) => s.link);
  const setLink = useSim((s) => s.setLink);
  const sendCommand = useSim((s) => s.sendCommand);
  const walkVisitor = useSim((s) => s.walkVisitor);
  const timeline = useMemo(() => result.timeline.filter((event) => event.hop !== 'api'), [result.timeline]);
  const total = timeline.length;
  const isCellAttack = (result.cells?.length ?? 0) > 0;

  useEffect(() => {
    setStep(1);
    const timer = setInterval(() => {
      setStep((value) => {
        if (value >= total) clearInterval(timer);
        return Math.min(total, value + 1);
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [result.id, replay, total]);

  const verdict = verdictCopy(result.metrics.verdict, result.scenario, result.metrics.exposure_rate);
  const accessCode = isAccessCode(result.scenario);
  const effect = houseEffect(result);
  const applyToHouse = () => {
    // A porta abre antes de degradar o enlace: quem a abre é o atacante, não o comando sujeito à perda.
    if (effect === 'open_door') sendCommand({ type: 'door', open: true });
    if (effect === 'visitor') walkVisitor();
    setLink(linkConditionFrom(result, scenario?.label ?? result.scenario));
  };
  const endOnHouse = () => {
    const reopened = link?.doorOpened;
    setLink(null);
    if (reopened) sendCommand({ type: 'door', open: false });
  };
  const applyHint = effect === 'open_door'
    ? 'Abre a porta na maquete e aplica esta perda e latência aos comandos do Laboratório.'
    : effect === 'visitor'
      ? 'Faz alguém passar pelo sensor e aplica esta perda e latência aos comandos do Laboratório.'
      : 'Aplica esta perda e latência aos comandos do Laboratório.';
  const visible = timeline.slice(0, step);
  const activeHop = visible[visible.length - 1]?.hop ?? null;
  const applied = link !== null;

  return (
    <>
      <section className={`net-verdict ${verdict.tone}`}>
        <div>
          <h2>{verdict.title}</h2>
          <p>{verdict.detail}</p>
          {result.metrics.exposure_rate > 0 && <p className="net-exposed">O código de acesso foi lido em {rate(result.metrics.exposure_rate)} das tentativas.</p>}
        </div>
        <small>{scenario?.label ?? result.scenario} · intensidade {Math.round(result.intensity * 100)}% · {result.trials} alertas · semente {result.seed}</small>
      </section>

      {isCellAttack ? <CellAttack result={result} /> : <section className="net-card">
        <div className="net-card-head">
          <h3>Caminho do alerta</h3>
          <button className="opt-mini" onClick={() => setReplay((n) => n + 1)}><RotateCcw size={12} /> Repetir</button>
        </div>
        <PathDiagram result={result} activeHop={activeHop} />
        <ol className="net-timeline" aria-label="Passo a passo do desfecho mais frequente">
          {visible.map((event, index) => (
            <li key={index} className={event.kind}><time>+{duration(event.t_ms)}</time><span>{event.message}</span></li>
          ))}
        </ol>
      </section>}

      <section className="net-card">
        <h3>Efeito das defesas</h3>
        <Comparison withDefenses={result.metrics} without={result.without_defenses} subject={accessCode ? 'Código' : 'Alerta'} />
        <div className="net-apply">
          {applied ? (
            <button className="opt-mini" onClick={endOnHouse}>Encerrar na casa</button>
          ) : (
            <button className="opt-mini" onClick={applyToHouse}>Aplicar na casa</button>
          )}
          <small>{applied ? `Comandos da casa sob: ${link.label}. Veja o efeito no Laboratório.` : applyHint}</small>
        </div>
      </section>
    </>
  );
}

export function NetworkPage() {
  const state = useNetwork();
  const { load } = state;
  useEffect(() => { void load(); }, [load]);

  const scenario = state.catalog?.scenarios.find((item) => item.id === state.scenario);
  const resultScenario = state.catalog?.scenarios.find((item) => item.id === state.result?.scenario);
  const defenseLabel = (id: Defense) => state.catalog?.defenses.find((item) => item.id === id)?.label ?? id;

  return (
    <div className="page net-page">
      <div className="page-head">
        <span className="eyebrow">Telecomunicações</span>
        <h1>Rede</h1>
        <p>Do sensor ao celular: veja o que acontece com o alerta da casa quando a comunicação falha ou é atacada.</p>
      </div>

      {state.error && (
        <div className="opt-warn-box net-error" role="alert">
          <span>{state.error}</span>
          <button onClick={state.dismiss} aria-label="Fechar"><X size={14} /></button>
        </div>
      )}

      {state.homes.length === 0 && !state.busy && !state.error && <p className="net-empty">Crie uma residência na página Usuários para usar o laboratório.</p>}

      {state.homes.length > 0 && (
        <div className="net-layout">
          <aside className="net-controls">
            <label className="opt-field">
              <span>Residência</span>
              <select value={state.homeId} onChange={(e) => void state.selectHome(e.target.value)}>
                {state.homes.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}
              </select>
            </label>

            <div className="net-group">
              <h3>Cenário</h3>
              {state.catalog?.scenarios.map((item) => (
                <button key={item.id} className={item.id === state.scenario ? 'net-option on' : 'net-option'} aria-pressed={item.id === state.scenario} onClick={() => state.setScenario(item.id)}>
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                  <em>{item.lessons.join(' · ')}</em>
                </button>
              ))}
            </div>

            {state.scenario === 'fake_base_station' && (
              <div className="net-group">
                <h3>Geração da antena falsa</h3>
                <div className="net-seg" role="group" aria-label="Geração da antena falsa">
                  {GENERATIONS.map((generation) => (
                    <button key={generation} className={generation === state.fakeGeneration ? 'on' : ''} aria-pressed={generation === state.fakeGeneration} onClick={() => state.setFakeGeneration(generation)}>{generation}</button>
                  ))}
                </div>
              </div>
            )}

            {state.scenario !== 'baseline' && (
              <label className="net-range">
                <span>Intensidade <b>{Math.round(state.intensity * 100)}%</b></span>
                <input type="range" min={0} max={1} step={0.05} value={state.intensity} onChange={(e) => state.setIntensity(Number(e.target.value))} />
              </label>
            )}

            <div className="net-group">
              <h3>Defesas</h3>
              {state.catalog?.defenses.map((item) => {
                const on = state.defenses.includes(item.id);
                return (
                  <button key={item.id} className={on ? 'net-option on' : 'net-option'} aria-pressed={on} onClick={() => state.toggleDefense(item.id)}>
                    <b>{item.label}{scenario?.relevant_defenses.includes(item.id) && <span className="opt-tag muted">atua aqui</span>}</b>
                    <small>{item.description}</small>
                  </button>
                );
              })}
            </div>

            <button className="opt-run" disabled={!state.catalog || state.busy !== null} onClick={() => void state.run()}>
              <Play size={15} /> {state.busy ?? 'Simular cenário'}
            </button>

            {state.history.length > 0 && (
              <div className="net-group">
                <h3>Histórico</h3>
                {state.history.slice(0, 8).map((item) => (
                  <button key={item.id} className={item.id === state.result?.id ? 'opt-run-row on' : 'opt-run-row'} onClick={() => void state.open(item.id)}>
                    <b>{verdictCopy(item.verdict, item.scenario).title}</b>
                    <small>{state.catalog?.scenarios.find((s) => s.id === item.scenario)?.label ?? item.scenario}{item.defenses.length ? ` · ${item.defenses.map(defenseLabel).join(', ')}` : ' · sem defesas'}</small>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="net-main">
            {state.result ? <Result key={state.result.id} result={state.result} scenario={resultScenario} /> : (
              <section className="net-card net-placeholder">
                <Wifi size={26} />
                <p>Escolha um cenário e as defesas, depois simule. Teste primeiro sem defesas para ver o problema.</p>
              </section>
            )}
            {state.catalog && <p className="net-notice">{state.catalog.notice}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
