// Typed API client — all requests go through here.
// The server sets the JWT in an httpOnly cookie so we just send credentials.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${BASE}${path}`;
  const isFormData = body instanceof FormData;

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: isFormData
      ? undefined
      : body
      ? { 'Content-Type': 'application/json' }
      : undefined,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    ...options,
  });

  let json: any;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Request failed', err.details);
  }
  return json as ApiResponse<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>, options?: RequestInit) => {
    const url = params
      ? `${path}?${new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()}`
      : path;
    return request<T>('GET', url, undefined, options);
  },
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  postForm: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};
