import { echarts, type ECharts } from './echarts';
import { Calculator, Hand, Move, Play, Plus, RotateCcw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CRITERIA, filterSolutions, missingInputs, money, pct, signed, sortSolutions, type Criterion } from '../optimization/pareto';
import { useOptimization, type Tool } from '../optimization/store';
import type { HomeLayout, Metrics, Solution } from '../optimization/types';
import { OptimizationScene, typeColor } from '../three/OptimizationScene';

type Tab = 'casa' | 'sensores' | 'executar' | 'pareto';

const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

function uniqueId(base: string, taken: string[]): string {
  let id = slug(base);
  for (let n = 2; taken.includes(id); n += 1) id = `${slug(base)}-${n}`;
  return id;
}

function NumberField({ label, value, onChange, step = 0.01, min, max, nullable = false }: {
  label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; nullable?: boolean;
}) {
  return (
    <label className="opt-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={nullable ? 'informe' : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(nullable ? null : 0);
          else if (Number.isFinite(Number(raw))) onChange(Number(raw));
        }}
      />
    </label>
  );
}

function MetricsRow({ metrics, compact = false }: { metrics: Metrics; compact?: boolean }) {
  return (
    <div className={compact ? 'opt-metrics compact' : 'opt-metrics'}>
      <div><small>Cobertura</small><b>{pct(metrics.coverage)}</b></div>
      <div><small>Custo</small><b>{money(metrics.cost)}</b></div>
      <div><small>Vulnerabilidade</small><b>{pct(metrics.vulnerability)}</b></div>
      {!compact && <div><small>Sensores</small><b>{metrics.sensor_count}</b></div>}
    </div>
  );
}

function ParetoChart({ solutions, manual, selected, onSelect }: {
  solutions: Solution[]; manual: Metrics | null; selected: string | null; onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inst = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.current = inst;
    inst.on('click', (p) => {
      const id = (p.data as { id?: string } | undefined)?.id;
      if (id) select.current(id);
    });
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(el);
    return () => { ro.disconnect(); inst.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    const vulns = solutions.map((s) => s.metrics.vulnerability);
    chart.current?.setOption({
      grid: { left: 46, right: 14, top: 18, bottom: 54 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { data: { label: string; value: number[] } }) => `${p.data.label}<br/>Custo ${money(p.data.value[0])}<br/>Cobertura ${p.data.value[1].toFixed(1)}%<br/>Vulnerabilidade ${(p.data.value[2] * 100).toFixed(1)}%`,
      },
      xAxis: { name: 'Custo', nameLocation: 'middle', nameGap: 26, type: 'value', scale: true, axisLabel: { color: '#8ea0bb' }, splitLine: { lineStyle: { color: '#1c2838' } } },
      yAxis: { name: 'Cobertura %', type: 'value', min: 0, max: 100, axisLabel: { color: '#8ea0bb' }, splitLine: { lineStyle: { color: '#1c2838' } } },
      visualMap: {
        type: 'continuous', dimension: 2, seriesIndex: 0, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, itemWidth: 10,
        min: Math.min(0, ...vulns), max: Math.max(1e-6, ...vulns), text: ['vuln. alta', 'baixa'], textStyle: { color: '#8ea0bb', fontSize: 10 },
        inRange: { color: ['#38f5a8', '#f4e06d', '#ff5d73'] },
      },
      series: [
        {
          name: 'Calculadas (NSGA-II)', type: 'scatter',
          data: solutions.map((s) => ({
            id: s.id, label: `Solução #${s.index + 1}`,
            value: [s.metrics.cost, s.metrics.coverage * 100, s.metrics.vulnerability],
            symbolSize: s.id === selected ? 18 : 11,
            itemStyle: s.id === selected ? { borderColor: '#fff', borderWidth: 2 } : undefined,
          })),
        },
        {
          name: 'Manual', type: 'scatter', symbol: 'diamond', symbolSize: 16, itemStyle: { color: '#c38bff', borderColor: '#fff', borderWidth: 1 },
          data: manual ? [{ label: 'Configuração manual', value: [manual.cost, manual.coverage * 100, manual.vulnerability] }] : [],
        },
      ],
    }, true);
  }, [solutions, manual, selected]);

  return <div ref={ref} className="opt-chart" role="img" aria-label="Fronteira de Pareto: custo × cobertura, cor = vulnerabilidade" />;
}

function LayoutEditor({ layout, canEdit }: { layout: HomeLayout; canEdit: boolean }) {
  const editDraft = useOptimization((s) => s.editDraft);
  const [roomId, setRoomId] = useState(layout.rooms[0]?.id ?? '');
  const room = layout.rooms.find((r) => r.id === roomId) ?? layout.rooms[0];
  if (!room) return null;
  const points = layout.critical_points.filter((p) => p.room_id === room.id);
  const candidates = layout.candidate_points.filter((c) => c.room_id === room.id);
  const center: [number, number, number] = [(room.min_xz[0] + room.max_xz[0]) / 2, room.floor_y + room.height / 2, (room.min_xz[1] + room.max_xz[1]) / 2];

  const editRoom = (patch: Partial<typeof room>) => editDraft((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r)) }));

  return (
    <fieldset className="opt-editor" disabled={!canEdit}>
      <label className="opt-field wide">
        <span>Ambiente</span>
        <select value={room.id} onChange={(e) => setRoomId(e.target.value)}>
          {layout.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="opt-field wide"><span>Nome</span><input value={room.name} maxLength={80} onChange={(e) => editRoom({ name: e.target.value })} /></label>
      <div className="opt-sub">Sensores deste ambiente também enxergam:</div>
      <div className="chips">
        {layout.rooms.filter((r) => r.id !== room.id).map((r) => {
          const on = room.visible_room_ids.includes(r.id);
          return (
            <button key={r.id} type="button" className={on ? 'chip on' : 'chip'} onClick={() => editRoom({ visible_room_ids: on ? room.visible_room_ids.filter((v) => v !== r.id) : [...room.visible_room_ids, r.id] })}>
              {r.name}
            </button>
          );
        })}
      </div>

      <div className="opt-sub row-between">
        <span>Pontos críticos ({points.length})</span>
        <button type="button" className="opt-mini" onClick={() => editDraft((l) => ({
          ...l,
          critical_points: [...l.critical_points, { id: uniqueId(`ponto-${room.id}`, l.critical_points.map((p) => p.id)), name: 'Novo ponto crítico', room_id: room.id, position: center, importance: 3 }],
        }))}><Plus size={12} /> Ponto</button>
      </div>
      {points.map((p) => (
        <div key={p.id} className="opt-item">
          <input value={p.name} maxLength={80} aria-label="Nome do ponto" onChange={(e) => editDraft((l) => ({ ...l, critical_points: l.critical_points.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) }))} />
          <div className="opt-grid4">
            {[0, 1, 2].map((axis) => (
              <NumberField key={axis} label={'xyz'[axis]} value={p.position[axis]} onChange={(v) => editDraft((l) => ({
                ...l, critical_points: l.critical_points.map((x) => (x.id === p.id ? { ...x, position: x.position.map((c, i) => (i === axis ? v ?? 0 : c)) as [number, number, number] } : x)),
              }))} />
            ))}
            <label className="opt-field"><span>Importância</span>
              <select value={p.importance} onChange={(e) => editDraft((l) => ({ ...l, critical_points: l.critical_points.map((x) => (x.id === p.id ? { ...x, importance: Number(e.target.value) } : x)) }))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="opt-mini danger" onClick={() => editDraft((l) => ({ ...l, critical_points: l.critical_points.filter((x) => x.id !== p.id) }))}><Trash2 size={12} /> Remover</button>
        </div>
      ))}

      <div className="opt-sub row-between">
        <span>Pontos candidatos ({candidates.length})</span>
        <button type="button" className="opt-mini" onClick={() => editDraft((l) => ({
          ...l,
          candidate_points: [...l.candidate_points, { id: uniqueId(`cand-${room.id}`, l.candidate_points.map((c) => c.id)), name: 'Novo ponto candidato', room_id: room.id, position: center, allowed_sensor_type_ids: [l.sensor_types[0].id], extra_installation_cost: 0, direction: null }],
        }))}><Plus size={12} /> Candidato</button>
      </div>
      {candidates.map((c) => (
        <div key={c.id} className="opt-item">
          <input value={c.name} maxLength={80} aria-label="Nome do candidato" onChange={(e) => editDraft((l) => ({ ...l, candidate_points: l.candidate_points.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }))} />
          <div className="opt-grid4">
            {[0, 1, 2].map((axis) => (
              <NumberField key={axis} label={'xyz'[axis]} value={c.position[axis]} onChange={(v) => editDraft((l) => ({
                ...l, candidate_points: l.candidate_points.map((x) => (x.id === c.id ? { ...x, position: x.position.map((q, i) => (i === axis ? v ?? 0 : q)) as [number, number, number] } : x)),
              }))} />
            ))}
            <NumberField label="Custo extra" value={c.extra_installation_cost} min={0} onChange={(v) => editDraft((l) => ({ ...l, candidate_points: l.candidate_points.map((x) => (x.id === c.id ? { ...x, extra_installation_cost: Math.max(0, v ?? 0) } : x)) }))} />
          </div>
          <div className="chips">
            {layout.sensor_types.map((t) => {
              const on = c.allowed_sensor_type_ids.includes(t.id);
              return (
                <button key={t.id} type="button" className={on ? 'chip on' : 'chip'} onClick={() => editDraft((l) => ({
                  ...l,
                  candidate_points: l.candidate_points.map((x) => {
                    if (x.id !== c.id) return x;
                    const next = on ? x.allowed_sensor_type_ids.filter((id) => id !== t.id) : [...x.allowed_sensor_type_ids, t.id];
                    return next.length ? { ...x, allowed_sensor_type_ids: next } : x;
                  }),
                }))}>{t.name}</button>
              );
            })}
          </div>
          <button type="button" className="opt-mini danger" onClick={() => editDraft((l) => ({ ...l, candidate_points: l.candidate_points.filter((x) => x.id !== c.id) }))}><Trash2 size={12} /> Remover</button>
        </div>
      ))}
    </fieldset>
  );
}

function SensorCatalog({ layout, canEdit }: { layout: HomeLayout; canEdit: boolean }) {
  const editDraft = useOptimization((s) => s.editDraft);
  const editType = (id: string, patch: Partial<HomeLayout['sensor_types'][number]>) => editDraft((l) => ({ ...l, sensor_types: l.sensor_types.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  return (
    <fieldset className="opt-editor" disabled={!canEdit}>
      <div className="opt-grid2">
        <NumberField label="Orçamento máximo" value={layout.budget} min={0} step={1} nullable onChange={(v) => editDraft((l) => ({ ...l, budget: v }))} />
        <NumberField label="Limiar de cobertura (0–1)" value={layout.coverage_threshold} min={0.01} max={1} onChange={(v) => editDraft((l) => ({ ...l, coverage_threshold: Math.min(1, Math.max(0.01, v ?? 0.8)) }))} />
      </div>
      {layout.sensor_types.map((t) => (
        <div key={t.id} className="opt-item">
          <div className="row-between"><b style={{ color: typeColor(layout, t.id) }}>■ {t.name}</b><small>{t.id}</small></div>
          <div className="opt-grid3">
            <NumberField label="Custo unitário" value={t.unit_cost} min={0} step={1} nullable onChange={(v) => editType(t.id, { unit_cost: v })} />
            <NumberField label="Instalação" value={t.installation_cost} min={0} step={1} nullable onChange={(v) => editType(t.id, { installation_cost: v })} />
            <NumberField label="Estoque" value={t.stock} min={0} step={1} onChange={(v) => editType(t.id, { stock: Math.max(0, Math.round(v ?? 0)) })} />
            <NumberField label="Alcance" value={t.range} min={0.01} onChange={(v) => editType(t.id, { range: Math.max(0.01, v ?? 0.01) })} />
            <NumberField label="Abertura (°)" value={t.field_of_view_deg} min={1} max={360} step={1} onChange={(v) => editType(t.id, { field_of_view_deg: Math.min(360, Math.max(1, v ?? 360)) })} />
            <NumberField label="Confiabilidade" value={t.reliability} min={0.01} max={1} onChange={(v) => editType(t.id, { reliability: Math.min(1, Math.max(0.01, v ?? 1)) })} />
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export function OptimizationPage() {
  const s = useOptimization();
  const [tab, setTab] = useState<Tab>('casa');
  const [criterion, setCriterion] = useState<Criterion>('balanced');
  const [minCoverage, setMinCoverage] = useState(0);
  const [maxCost, setMaxCost] = useState<number | null>(null);
  const [configName, setConfigName] = useState('');

  useEffect(() => { void useOptimization.getState().loadHomes(); }, []);
  useEffect(() => {
    if (!s.error && !s.notice) return;
    const t = setTimeout(() => useOptimization.getState().dismiss(), 7000);
    return () => clearTimeout(t);
  }, [s.error, s.notice]);

  const home = s.homes.find((h) => h.id === s.homeId);
  const canEdit = home?.role === 'primary' || home?.role === 'master';
  const showing = s.solutionId && s.run ? 'calculated' : 'manual';
  const sceneLayout = showing === 'calculated' && s.run ? s.run.layout : s.draft;
  const selectedSolution = s.run?.solutions.find((x) => x.id === s.solutionId) ?? null;
  const sceneSensors = showing === 'calculated' ? selectedSolution?.sensors ?? [] : s.manual;
  const sceneCoverage = showing === 'calculated' ? s.solution?.points ?? null : s.manualEval?.points ?? null;
  const missing = s.draft ? missingInputs(s.draft) : [];
  const visible = useMemo(
    () => (s.run ? sortSolutions(filterSolutions(s.run.solutions, { minCoverage, maxCost }), criterion, s.run.layout.coverage_threshold) : []),
    [s.run, minCoverage, maxCost, criterion],
  );
  const best = visible[0] ?? null;
  const criterionLabel = CRITERIA.find((c) => c.id === criterion)?.label ?? criterion;
  const entryOf = (id: string) => s.comparison?.entries.find((e) => e.solution_id === id);

  if (!s.homes.length) {
    return (
      <div className="page">
        <span className="eyebrow">SecureBase · otimização</span>
        <h1>Laboratório de otimização</h1>
        <p>{s.busy ? 'Carregando residências…' : s.error ?? 'Crie ou entre em uma residência na página Usuários para planejar sensores.'}</p>
      </div>
    );
  }

  return (
    <main className="lab opt">
      <section className="stage">
        <div className="stage-view">
          {sceneLayout && (
            <OptimizationScene
              layout={sceneLayout}
              sensors={sceneSensors}
              coverage={sceneCoverage}
              interactive={showing === 'manual'}
              moving={s.moving}
              selectedRoom={null}
              onCandidate={s.clickCandidate}
            />
          )}
        </div>
        <div className="stage-top">
          <span className={showing === 'manual' ? 'opt-badge manual' : 'opt-badge calc'}>
            {showing === 'manual'
              ? <><Hand size={13} /> CONFIGURAÇÃO MANUAL{s.dirty ? ' · layout não salvo' : ''}</>
              : <><Calculator size={13} /> CALCULADA · NSGA-II · solução #{(selectedSolution?.index ?? 0) + 1} · seed {s.run?.seed}</>}
          </span>
          {showing === 'calculated' && (
            <button type="button" className="demo-toggle" onClick={s.showManual}><Hand size={13} /> Voltar ao manual</button>
          )}
        </div>
        {showing === 'manual' && s.draft && (
          <div className="stage-tools">
            <div className="tool-group opt-tools">
              {([['place', Plus, 'Posicionar'], ['move', Move, 'Mover'], ['remove', Trash2, 'Remover']] as [Tool, typeof Plus, string][]).map(([id, Icon, label]) => (
                <button key={id} type="button" className={s.tool === id ? 'on' : ''} onClick={() => s.setTool(id)}><Icon size={13} /> {label}</button>
              ))}
              {s.tool === 'place' && (
                <select value={s.sensorType ?? ''} onChange={(e) => s.setSensorType(e.target.value)} aria-label="Tipo de sensor">
                  {s.draft.sensor_types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <button type="button" onClick={s.clearManual} disabled={!s.manual.length}><RotateCcw size={13} /> Limpar</button>
            </div>
          </div>
        )}
        <div className="opt-legend">
          <span><i className="dot ok" /> coberto</span>
          <span><i className="dot bad" /> não coberto</span>
          <span><i className="dot idle" /> sem cálculo</span>
          <span><i className="diamond" /> candidato</span>
          {sceneLayout?.sensor_types.map((t) => <span key={t.id}><i className="sq" style={{ background: typeColor(sceneLayout, t.id) }} /> {t.name}</span>)}
        </div>
        {(s.error || s.notice) && (
          <div className={s.error ? 'opt-toast err' : 'opt-toast'} role="status">
            <span>{s.error ?? s.notice}</span>
            <button type="button" onClick={s.dismiss} aria-label="Fechar"><X size={13} /></button>
          </div>
        )}
      </section>

      <aside className="dock">
        <div className="opt-head">
          <select value={s.homeId} onChange={(e) => { void s.selectHome(e.target.value); }} aria-label="Residência">
            {s.homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          {s.doc && <small>{s.doc.source === 'template' ? 'Layout-base da maquete — revise e salve' : `Layout salvo · versão ${s.doc.version}`}</small>}
          {s.dirty && canEdit && (
            <div className="opt-actions">
              <button type="button" className="primary" disabled={!!s.busy} onClick={() => { void s.saveLayout(); }}><Save size={13} /> Salvar layout</button>
              <button type="button" onClick={s.discardDraft}>Descartar</button>
            </div>
          )}
          {!canEdit && <small className="opt-warn">Somente o primary ou o master desta residência pode alterar o layout e executar a otimização.</small>}
        </div>

        <div className="dock-tabs">
          {([['casa', 'Casa'], ['sensores', 'Sensores'], ['executar', 'Executar'], ['pareto', 'Pareto']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="dock-body">
          {s.draft && tab === 'casa' && (
            <>
              <p className="dock-note">Ambientes, pontos críticos e posições candidatas usam as coordenadas da maquete. Sensores só podem ser instalados nos candidatos (◆).</p>
              <LayoutEditor layout={s.draft} canEdit={canEdit} />
            </>
          )}

          {s.draft && tab === 'sensores' && (
            <>
              <section className="app-section">
                <h4>Configuração manual</h4>
                {s.manualEval ? (
                  <>
                    <MetricsRow metrics={s.manualEval.metrics} />
                    {s.manualEval.feasible
                      ? <small className="opt-ok">Respeita orçamento e estoque.</small>
                      : s.manualEval.violations.map((v) => <small key={v.detail} className="opt-warn">{v.detail}</small>)}
                  </>
                ) : <small className="opt-warn">{s.manualEvalError ?? 'Calculando…'}</small>}
                {canEdit && (
                  <form className="opt-actions" onSubmit={(e) => { e.preventDefault(); if (configName.trim()) { void s.saveConfig(configName.trim()); setConfigName(''); } }}>
                    <input value={configName} maxLength={120} placeholder="Nome da configuração" onChange={(e) => setConfigName(e.target.value)} />
                    <button type="submit" disabled={!configName.trim() || !!s.busy}><Save size={13} /> Salvar</button>
                  </form>
                )}
                {s.configs.map((c) => (
                  <div key={c.id} className="opt-config">
                    <button type="button" onClick={() => s.loadConfig(c)}>
                      <b>{c.name}</b>
                      <small>{c.evaluation ? `${pct(c.evaluation.metrics.coverage)} · ${money(c.evaluation.metrics.cost)}` : c.evaluation_error}</small>
                    </button>
                    {canEdit && <button type="button" aria-label={`Remover ${c.name}`} onClick={() => { void s.deleteConfig(c.id); }}><Trash2 size={12} /></button>}
                  </div>
                ))}
              </section>
              <p className="dock-note">Orçamento, custos e estoque limitam as soluções viáveis. Campos vazios precisam ser informados antes de calcular — o sistema não supõe valores.</p>
              <SensorCatalog layout={s.draft} canEdit={canEdit} />
            </>
          )}

          {s.draft && tab === 'executar' && (
            <>
              {missing.length > 0 && (
                <div className="opt-warn-box"><b>Preencha antes de otimizar:</b><ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
              )}
              {s.doc?.source !== 'saved' && <div className="opt-warn-box">Salve o layout para poder otimizar.</div>}
              <fieldset className="opt-editor" disabled={!canEdit}>
                <div className="opt-grid3">
                  <NumberField label="População" value={s.params.population_size} step={10} min={10} max={200} onChange={(v) => s.setParams({ population_size: Math.round(v ?? 60) })} />
                  <NumberField label="Gerações" value={s.params.generations} step={10} min={1} max={300} onChange={(v) => s.setParams({ generations: Math.round(v ?? 100) })} />
                  <NumberField label="Semente" value={s.params.seed} step={1} min={0} nullable onChange={(v) => s.setParams({ seed: v === null ? null : Math.round(v) })} />
                </div>
                <button type="button" className="primary opt-run" disabled={!!s.busy || s.dirty || missing.length > 0 || s.doc?.source !== 'saved'} onClick={() => { void s.runOptimization().then(() => setTab('pareto')); }}>
                  <Play size={14} /> {s.busy === 'run' ? 'Otimizando…' : 'Executar NSGA-II'}
                </button>
              </fieldset>
              <h4 className="opt-sub">Execuções anteriores</h4>
              {s.runs.length === 0 && <small className="dock-note">Nenhuma execução ainda.</small>}
              {s.runs.map((r) => (
                <button key={r.id} type="button" className={s.run?.id === r.id ? 'opt-run-row on' : 'opt-run-row'} onClick={() => { void s.openRun(r.id).then(() => setTab('pareto')); }}>
                  <b>{new Date(r.created_at).toLocaleString('pt-BR')}</b>
                  <small>{r.solution_count} soluções · pop {r.population_size} · {r.generations} ger. · seed {r.seed} · layout v{r.layout_version}</small>
                </button>
              ))}
            </>
          )}

          {tab === 'pareto' && (
            !s.run ? <p className="dock-note">Execute ou abra uma otimização para ver a fronteira de Pareto.</p> : (
              <>
                <p className="dock-note">
                  {s.run.solution_count} alternativas viáveis e não dominadas (NSGA-II, {s.run.library}, {s.run.evaluations} avaliações).
                  O botão abaixo aplica a primeira pelo critério escolhido. {s.doc && s.run.layout_version !== s.doc.version && <b>Calculada com o layout v{s.run.layout_version}; o atual é v{s.doc.version}.</b>}
                </p>
                <button
                  type="button"
                  className="primary opt-run opt-best"
                  disabled={!best}
                  title={best ? `Solução #${best.index + 1} · ${criterionLabel}` : 'Nenhuma solução atende aos filtros'}
                  onClick={() => { if (best) { s.applySolution(best.id, criterionLabel.toLowerCase()); setTab('sensores'); } }}
                >
                  <Sparkles size={14} /> Aplicar melhor opção{best ? ` · #${best.index + 1}` : ''}
                </button>
                {best && <MetricsRow metrics={best.metrics} compact />}
                <ParetoChart solutions={s.run.solutions} manual={s.comparison?.manual.metrics ?? null} selected={s.solutionId} onSelect={(id) => { void s.showSolution(id); }} />
                <div className="opt-grid3">
                  <label className="opt-field"><span>Ordenar por</span>
                    <select value={criterion} onChange={(e) => setCriterion(e.target.value as Criterion)}>
                      {CRITERIA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                  <NumberField label="Cobertura mín. %" value={Math.round(minCoverage * 100)} step={5} min={0} max={100} onChange={(v) => setMinCoverage(Math.min(1, Math.max(0, (v ?? 0) / 100)))} />
                  <NumberField label="Custo máx." value={maxCost} step={10} min={0} nullable onChange={setMaxCost} />
                </div>
                {s.comparison && (
                  <div className={s.comparison.manual_is_dominated ? 'opt-warn-box' : 'opt-ok-box'}>
                    <b>Manual × calculadas</b>
                    <MetricsRow metrics={s.comparison.manual.metrics} compact />
                    {s.comparison.manual_is_dominated
                      ? <small>Há solução calculada que é igual ou melhor em todos os objetivos e estritamente melhor em ao menos um (marcadas “domina manual”).</small>
                      : <small>Nenhuma solução calculada domina a configuração manual.</small>}
                    {!s.comparison.manual.feasible && <small>A configuração manual viola restrições.</small>}
                  </div>
                )}
                {visible.length === 0 && <p className="dock-note">Nenhuma solução atende aos filtros.</p>}
                {visible.map((sol) => {
                  const entry = entryOf(sol.id);
                  return (
                    <button key={sol.id} type="button" className={s.solutionId === sol.id ? 'opt-sol on' : 'opt-sol'} onClick={() => { void s.showSolution(sol.id); }}>
                      <div className="row-between"><b>Solução #{sol.index + 1}</b>{entry?.solution_dominates_manual && <span className="opt-tag">domina manual</span>}{entry?.manual_dominates_solution && <span className="opt-tag muted">dominada pela manual</span>}</div>
                      <MetricsRow metrics={sol.metrics} compact />
                      {entry && (
                        <small className="opt-delta">vs manual: cobertura {signed(entry.delta_coverage, pct)} · custo {signed(entry.delta_cost, money)} · vulnerabilidade {signed(entry.delta_vulnerability, pct)}</small>
                      )}
                      <small>{Object.entries(sol.metrics.sensors_by_type).map(([t, n]) => `${n}× ${s.run?.layout.sensor_types.find((x) => x.id === t)?.name ?? t}`).join(' · ') || 'Sem sensores'}</small>
                    </button>
                  );
                })}
                {s.solution && showing === 'calculated' && (
                  <button type="button" className="opt-copy" onClick={() => { s.copySolutionToManual(); setTab('sensores'); }}>Copiar solução #{s.solution.index + 1} para a configuração manual</button>
                )}
              </>
            )
          )}
        </div>
      </aside>
    </main>
  );
}
