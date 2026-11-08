import { create } from 'zustand';
import { secureBaseApi, type HomeProfile } from '../auth/api';
import type {
  Defense,
  Generation,
  LinkCatalog,
  LinkSimulationDetail,
  LinkSimulationSummary,
  Scenario,
} from './types';

interface NetworkState {
  homes: HomeProfile[];
  homeId: string;
  catalog: LinkCatalog | null;
  scenario: Scenario;
  intensity: number;
  defenses: Defense[];
  fakeGeneration: Generation;
  history: LinkSimulationSummary[];
  result: LinkSimulationDetail | null;
  busy: string | null;
  error: string | null;

  load: () => Promise<void>;
  selectHome: (homeId: string) => Promise<void>;
  setScenario: (scenario: Scenario) => void;
  setIntensity: (intensity: number) => void;
  setFakeGeneration: (fakeGeneration: Generation) => void;
  toggleDefense: (defense: Defense) => void;
  run: () => Promise<void>;
  open: (simulationId: string) => Promise<void>;
  dismiss: () => void;
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export const useNetwork = create<NetworkState>((set, get) => {
  async function task(label: string, fallback: string, fn: () => Promise<void>): Promise<void> {
    set({ busy: label, error: null });
    try {
      await fn();
    } catch (error) {
      set({ error: message(error, fallback) });
    } finally {
      set({ busy: null });
    }
  }

  return {
    homes: [],
    homeId: '',
    catalog: null,
    scenario: 'fake_base_station',
    intensity: 1,
    defenses: [],
    fakeGeneration: '2G',
    history: [],
    result: null,
    busy: null,
    error: null,

    load: () => task('Carregando…', 'Não foi possível carregar as residências.', async () => {
      const homes = await secureBaseApi.listHomes();
      set({ homes });
      const current = homes.find((home) => home.id === get().homeId) ?? homes[0];
      if (current) await get().selectHome(current.id);
    }),

    selectHome: (homeId) => task('Carregando…', 'Não foi possível abrir a residência.', async () => {
      set({ homeId, result: null, history: [] });
      const [catalog, history] = await Promise.all([
        secureBaseApi.getLinkCatalog(homeId),
        secureBaseApi.listLinkSimulations(homeId),
      ]);
      if (get().homeId === homeId) set({ catalog, history });
    }),

    setScenario: (scenario) => set({ scenario }),
    setIntensity: (intensity) => set({ intensity }),
    setFakeGeneration: (fakeGeneration) => set({ fakeGeneration }),
    toggleDefense: (defense) => set((state) => ({
      defenses: state.defenses.includes(defense)
        ? state.defenses.filter((item) => item !== defense)
        : [...state.defenses, defense],
    })),

    run: () => task('Simulando…', 'Não foi possível executar a simulação.', async () => {
      const { homeId, scenario, intensity, defenses, fakeGeneration } = get();
      const result = await secureBaseApi.runLinkSimulation(homeId, { scenario, intensity, defenses, fake_generation: fakeGeneration });
      if (get().homeId !== homeId) return;
      set((state) => ({ result, history: [result, ...state.history].slice(0, 20) }));
    }),

    open: (simulationId) => task('Abrindo…', 'Não foi possível abrir a simulação.', async () => {
      const { homeId } = get();
      const result = await secureBaseApi.getLinkSimulation(homeId, simulationId);
      if (get().homeId === homeId) set({ result });
    }),

    dismiss: () => set({ error: null }),
  };
});
