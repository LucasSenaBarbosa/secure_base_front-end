import { create } from 'zustand';
import { secureBaseApi, type HomeProfile } from '../auth/api';
import { moveSensor, placementError, placeSensor, removeSensor } from './pareto';
import type {
  Comparison,
  Evaluation,
  HomeLayout,
  LayoutDocument,
  ManualConfiguration,
  OptimizationRunRequest,
  RunDetail,
  RunSummary,
  SensorPlacement,
  SolutionDetail,
} from './types';

export type Tool = 'place' | 'move' | 'remove';

interface OptimizationState {
  homes: HomeProfile[];
  homeId: string;
  doc: LayoutDocument | null;
  draft: HomeLayout | null;
  dirty: boolean;
  manual: SensorPlacement[];
  manualEval: Evaluation | null;
  manualEvalError: string | null;
  tool: Tool;
  sensorType: string | null;
  moving: string | null;
  params: OptimizationRunRequest;
  runs: RunSummary[];
  run: RunDetail | null;
  /** `null` = configuração manual em exibição; caso contrário, solução calculada. */
  solutionId: string | null;
  solution: SolutionDetail | null;
  comparison: Comparison | null;
  configs: ManualConfiguration[];
  busy: string | null;
  error: string | null;
  notice: string | null;

  loadHomes: () => Promise<void>;
  selectHome: (homeId: string) => Promise<void>;
  editDraft: (change: (layout: HomeLayout) => HomeLayout) => void;
  discardDraft: () => void;
  saveLayout: () => Promise<void>;
  setTool: (tool: Tool) => void;
  setSensorType: (id: string) => void;
  clickCandidate: (candidateId: string) => void;
  clearManual: () => void;
  evaluateManual: () => Promise<void>;
  setParams: (params: Partial<OptimizationRunRequest>) => void;
  runOptimization: () => Promise<void>;
  openRun: (runId: string) => Promise<void>;
  showSolution: (solutionId: string) => Promise<void>;
  showManual: () => void;
  compare: () => Promise<void>;
  copySolutionToManual: () => void;
  /** Carrega uma solução da execução aberta como configuração manual (botão "Aplicar melhor opção"). */
  applySolution: (solutionId: string, reason: string) => void;
  saveConfig: (name: string) => Promise<void>;
  loadConfig: (config: ManualConfiguration) => void;
  deleteConfig: (id: string) => Promise<void>;
  dismiss: () => void;
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export const useOptimization = create<OptimizationState>((set, get) => {
  async function task<T>(label: string, fallback: string, fn: () => Promise<T>): Promise<T | undefined> {
    set({ busy: label, error: null, notice: null });
    try {
      return await fn();
    } catch (error) {
      set({ error: message(error, fallback) });
      return undefined;
    } finally {
      set({ busy: null });
    }
  }

  const changeManual = (manual: SensorPlacement[]) => {
    set({ manual, manualEval: null, comparison: null, solutionId: null, solution: null });
    void get().evaluateManual();
    void get().compare();
  };

  return {
    homes: [],
    homeId: '',
    doc: null,
    draft: null,
    dirty: false,
    manual: [],
    manualEval: null,
    manualEvalError: null,
    tool: 'place',
    sensorType: null,
    moving: null,
    params: { population_size: 60, generations: 100, seed: null },
    runs: [],
    run: null,
    solutionId: null,
    solution: null,
    comparison: null,
    configs: [],
    busy: null,
    error: null,
    notice: null,

    loadHomes: async () => {
      const homes = await task('homes', 'Não foi possível carregar as residências.', () => secureBaseApi.listHomes());
      if (!homes) return;
      set({ homes });
      const current = get().homeId;
      const next = homes.some((h) => h.id === current) ? current : homes[0]?.id;
      if (next) await get().selectHome(next);
    },

    selectHome: async (homeId) => {
      set({
        homeId, doc: null, draft: null, dirty: false, manual: [], manualEval: null, manualEvalError: null,
        runs: [], run: null, solutionId: null, solution: null, comparison: null, configs: [], moving: null,
      });
      await task('load', 'Não foi possível carregar o laboratório.', async () => {
        const [doc, runs, configs] = await Promise.all([
          secureBaseApi.getLayout(homeId),
          secureBaseApi.listOptimizationRuns(homeId),
          secureBaseApi.listManualConfigurations(homeId),
        ]);
        if (get().homeId !== homeId) return;
        set({ doc, draft: doc.layout, runs, configs, sensorType: doc.layout.sensor_types[0]?.id ?? null });
      });
    },

    editDraft: (change) => {
      const draft = get().draft;
      if (draft) set({ draft: change(draft), dirty: true, manualEval: null });
    },

    discardDraft: () => {
      const doc = get().doc;
      if (doc) set({ draft: doc.layout, dirty: false });
      void get().evaluateManual();
    },

    saveLayout: async () => {
      const { homeId, doc, draft } = get();
      if (!doc || !draft) return;
      const saved = await task('save', 'Não foi possível salvar o layout.', () => secureBaseApi.saveLayout(homeId, doc.version, draft));
      if (!saved) return;
      const valid = new Set(saved.layout.candidate_points.map((c) => c.id));
      set({
        doc: saved,
        draft: saved.layout,
        dirty: false,
        manual: get().manual.filter((s) => valid.has(s.candidate_id)),
        notice: `Layout salvo (versão ${saved.version}).`,
      });
      void get().evaluateManual();
    },

    setTool: (tool) => set({ tool, moving: null }),
    setSensorType: (sensorType) => set({ sensorType, tool: 'place', moving: null }),

    clickCandidate: (candidateId) => {
      const { tool, sensorType, manual, draft, moving, solutionId } = get();
      if (!draft) return;
      if (solutionId) {
        set({ error: 'Você está vendo uma solução calculada. Volte para a configuração manual para editar.' });
        return;
      }
      const occupied = manual.find((s) => s.candidate_id === candidateId);
      if (tool === 'remove') {
        if (occupied) changeManual(removeSensor(manual, candidateId));
        return;
      }
      if (tool === 'move') {
        if (!moving) {
          if (occupied) set({ moving: candidateId, error: null });
          return;
        }
        const source = manual.find((s) => s.candidate_id === moving);
        set({ moving: null });
        if (!source || candidateId === moving) return;
        const error = placementError(draft, removeSensor(manual, moving), { ...source, candidate_id: candidateId });
        if (error) set({ error });
        else changeManual(moveSensor(manual, moving, candidateId));
        return;
      }
      if (!sensorType) return;
      const next = { candidate_id: candidateId, sensor_type_id: sensorType };
      const error = placementError(draft, removeSensor(manual, candidateId), next);
      if (error) set({ error });
      else changeManual(placeSensor(manual, next));
    },

    clearManual: () => changeManual([]),

    evaluateManual: async () => {
      const { homeId, doc, dirty, manual } = get();
      if (!doc || doc.source !== 'saved' || dirty) {
        set({ manualEval: null, manualEvalError: 'Salve o layout para calcular as métricas.' });
        return;
      }
      try {
        const result = await secureBaseApi.evaluateConfiguration(homeId, manual);
        if (get().manual === manual) set({ manualEval: result, manualEvalError: null });
      } catch (error) {
        if (get().manual === manual) set({ manualEval: null, manualEvalError: message(error, 'Não foi possível avaliar.') });
      }
    },

    setParams: (params) => set({ params: { ...get().params, ...params } }),

    runOptimization: async () => {
      const { homeId, params } = get();
      const run = await task('run', 'Não foi possível executar a otimização.', () => secureBaseApi.runOptimization(homeId, params));
      if (!run) return;
      const { id, home_id, created_at, created_by, layout_version, algorithm, library, population_size,
        generations, seed, evaluations, duration_ms, status, solution_count } = run;
      set({
        run,
        runs: [{ id, home_id, created_at, created_by, layout_version, algorithm, library, population_size,
          generations, seed, evaluations, duration_ms, status, solution_count }, ...get().runs],
        solutionId: null,
        solution: null,
        comparison: null,
        notice: `${solution_count} alternativa(s) não dominada(s) em ${(duration_ms / 1000).toFixed(1)} s.`,
      });
      void get().compare();
    },

    openRun: async (runId) => {
      const run = await task('open', 'Não foi possível abrir a otimização.', () => secureBaseApi.getOptimizationRun(get().homeId, runId));
      if (!run) return;
      set({ run, solutionId: null, solution: null, comparison: null });
      void get().compare();
    },

    showSolution: async (solutionId) => {
      const { run, homeId } = get();
      if (!run) return;
      set({ solutionId, solution: null, moving: null });
      const solution = await task('solution', 'Não foi possível carregar a solução.', () => secureBaseApi.getSolution(homeId, run.id, solutionId));
      if (solution && get().solutionId === solutionId) set({ solution });
    },

    showManual: () => set({ solutionId: null, solution: null }),

    compare: async () => {
      const { run, homeId, manual } = get();
      if (!run) return;
      try {
        const comparison = await secureBaseApi.compareWithRun(homeId, run.id, manual);
        if (get().run?.id === run.id && get().manual === manual) set({ comparison });
      } catch (error) {
        set({ comparison: null, error: message(error, 'Não foi possível comparar.') });
      }
    },

    copySolutionToManual: () => {
      const { solution, run, doc } = get();
      if (!solution || !run) return;
      if (doc && run.layout_version !== doc.version) {
        set({ error: 'A solução foi calculada com outra versão do layout; copie apenas após uma nova otimização.' });
        return;
      }
      set({ notice: `Solução #${solution.index + 1} copiada como configuração manual editável.` });
      changeManual(solution.sensors.map((s) => ({ ...s })));
    },

    applySolution: (solutionId, reason) => {
      const { run, doc } = get();
      const chosen = run?.solutions.find((x) => x.id === solutionId);
      if (!run || !chosen) return;
      if (doc && run.layout_version !== doc.version) {
        set({ error: 'Esta execução usou outra versão do layout; execute a otimização de novo antes de aplicar.' });
        return;
      }
      set({ notice: `Solução #${chosen.index + 1} aplicada · critério ${reason}. Salve-a em Sensores para guardar.` });
      changeManual(chosen.sensors.map((s) => ({ ...s })));
    },

    saveConfig: async (name) => {
      const { homeId, manual } = get();
      const config = await task('config', 'Não foi possível salvar a configuração.', () => secureBaseApi.saveManualConfiguration(homeId, name, manual));
      if (config) set({ configs: [config, ...get().configs], notice: `Configuração “${config.name}” salva.` });
    },

    loadConfig: (config) => {
      set({ notice: `Configuração “${config.name}” carregada.` });
      changeManual(config.sensors.map((s) => ({ ...s })));
    },

    deleteConfig: async (id) => {
      const ok = await task('config', 'Não foi possível remover a configuração.', async () => {
        await secureBaseApi.deleteManualConfiguration(get().homeId, id);
        return true;
      });
      if (ok) set({ configs: get().configs.filter((c) => c.id !== id) });
    },

    dismiss: () => set({ error: null, notice: null }),
  };
});
