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
} from '../optimization/types';

export type UserRole = 'master' | 'primary' | 'member';

export const ACCESS_TOKEN_KEY = 'securebase-access-token';
export const CSRF_TOKEN_KEY = 'securebase-csrf-token';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface HomeProfile {
  id: string;
  name: string;
  primary_user_id: string;
  role: UserRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: UserProfile;
  csrf_token: string;
}

export interface RegisterResponse {
  message: string;
}

interface ProblemDetails {
  detail?: string;
  code?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
if (!configuredApiBaseUrl) {
  throw new Error('VITE_API_BASE_URL precisa estar definida antes de iniciar o frontend.');
}
const apiBaseUrl = configuredApiBaseUrl.replace(/\/$/, '');
let refreshRequest: Promise<string> | null = null;

function getCsrfToken(): string | null {
  return localStorage.getItem(CSRF_TOKEN_KEY);
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function refreshAccessToken(): Promise<string> {
  if (refreshRequest) return await refreshRequest;
  refreshRequest = (async () => {
    const csrfToken = getCsrfToken();
    if (!csrfToken) throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    if (!response.ok) {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      let detail: string | undefined;
      try {
        detail = (await response.json() as ProblemDetails).detail;
      } catch {
        detail = undefined;
      }
      throw new ApiError(detail || 'Sua sessão expirou. Entre novamente.', response.status);
    }
    const session = await response.json() as LoginResponse;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
    localStorage.setItem(CSRF_TOKEN_KEY, session.csrf_token);
    return session.access_token;
  })();
  try {
    return await refreshRequest;
  } finally {
    refreshRequest = null;
  }
}

async function accessToken(): Promise<string> {
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  return token || await refreshAccessToken();
}

async function sendRequest(url: string, init: RequestInit): Promise<Response> {
  const hasIdempotencyKey = new Headers(init.headers).has('Idempotency-Key');
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!(error instanceof TypeError) || !hasIdempotencyKey) throw error;
    return await fetch(url, init);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const makeRequest = async (token: string) => sendRequest(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  let response = await makeRequest(await accessToken());
  if (response.status === 401) {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    response = await makeRequest(await refreshAccessToken());
  }

  if (!response.ok) {
    const problem = await response.json() as ProblemDetails;
    throw new ApiError(
      problem.detail || `A API recusou a operação (${response.status}).`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function homePath(homeId: string, path: string): string {
  return `/api/v1/homes/${encodeURIComponent(homeId)}${path}`;
}

async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const problem = await response.json() as ProblemDetails;
      detail = problem.detail;
    } catch {
      detail = undefined;
    }
    throw new Error(detail || 'Não foi possível entrar. Tente novamente.');
  }
  return await response.json() as LoginResponse;
}

async function register(
  email: string,
  password: string,
  name: string,
): Promise<RegisterResponse> {
  const response = await sendRequest(`${apiBaseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey(),
    },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const problem = await response.json() as ProblemDetails;
      detail = problem.detail;
    } catch {
      detail = undefined;
    }
    throw new Error(detail || 'Não foi possível criar a conta. Tente novamente.');
  }
  return await response.json() as RegisterResponse;
}

async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<void>('/api/v1/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

async function logout(): Promise<void> {
  const csrfToken = getCsrfToken();
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  });
  if (!response.ok) {
    const problem = await response.json() as ProblemDetails;
    throw new ApiError(
      problem.detail || 'Não foi possível encerrar a sessão no servidor.',
      response.status,
    );
  }
}

export const secureBaseApi = {
  login,
  register,
  changePassword,
  logout,
  currentUser: () => request<UserProfile>('/api/v1/auth/me'),
  listHomes: () => request<HomeProfile[]>('/api/v1/homes'),
  createHome: (name: string) => request<HomeProfile>('/api/v1/homes', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify({ name }),
  }),
  listHomeUsers: (homeId: string) => request<UserProfile[]>(
    `/api/v1/homes/${encodeURIComponent(homeId)}/users`,
  ),
  addHomeUser: (homeId: string, email: string) => request<UserProfile>(
    `/api/v1/homes/${encodeURIComponent(homeId)}/users`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ email }),
    },
  ),
  removeHomeUser: (homeId: string, userId: string) => request<void>(
    `/api/v1/homes/${encodeURIComponent(homeId)}/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  ),
  transferHomePrimary: (homeId: string, userId: string) => request<HomeProfile>(
    `/api/v1/homes/${encodeURIComponent(homeId)}/primary`,
    { method: 'PATCH', body: JSON.stringify({ user_id: userId }) },
  ),
  getLayout: (homeId: string) => request<LayoutDocument>(homePath(homeId, '/layout')),
  saveLayout: (homeId: string, version: number, layout: HomeLayout) => request<LayoutDocument>(
    homePath(homeId, '/layout'),
    { method: 'PUT', body: JSON.stringify({ version, layout }) },
  ),
  evaluateConfiguration: (homeId: string, sensors: SensorPlacement[]) => request<Evaluation>(
    homePath(homeId, '/configurations/evaluate'),
    { method: 'POST', body: JSON.stringify({ sensors }) },
  ),
  runOptimization: (homeId: string, params: OptimizationRunRequest) => request<RunDetail>(
    homePath(homeId, '/optimization-runs'),
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify(params),
    },
  ),
  listOptimizationRuns: (homeId: string) => request<RunSummary[]>(
    homePath(homeId, '/optimization-runs?limit=20'),
  ),
  getOptimizationRun: (homeId: string, runId: string) => request<RunDetail>(
    homePath(homeId, `/optimization-runs/${encodeURIComponent(runId)}`),
  ),
  getSolution: (homeId: string, runId: string, solutionId: string) => request<SolutionDetail>(
    homePath(
      homeId,
      `/optimization-runs/${encodeURIComponent(runId)}/solutions/${encodeURIComponent(solutionId)}`,
    ),
  ),
  compareWithRun: (homeId: string, runId: string, sensors: SensorPlacement[]) => request<Comparison>(
    homePath(homeId, `/optimization-runs/${encodeURIComponent(runId)}/compare`),
    { method: 'POST', body: JSON.stringify({ sensors }) },
  ),
  listManualConfigurations: (homeId: string) => request<ManualConfiguration[]>(
    homePath(homeId, '/manual-configurations'),
  ),
  saveManualConfiguration: (homeId: string, name: string, sensors: SensorPlacement[]) => (
    request<ManualConfiguration>(homePath(homeId, '/manual-configurations'), {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({ name, sensors }),
    })
  ),
  deleteManualConfiguration: (homeId: string, configurationId: string) => request<void>(
    homePath(homeId, `/manual-configurations/${encodeURIComponent(configurationId)}`),
    { method: 'DELETE' },
  ),
  listUsers: () => request<UserProfile[]>('/api/v1/users'),
  deleteUser: (id: string) => request<void>(`/api/v1/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
};
