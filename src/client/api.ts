import type { ApiEnvelope, ApiErrorPayload } from '../shared/contracts'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
    credentials: 'same-origin',
  })

  let payload: ApiEnvelope<T> | ApiErrorPayload | null = null
  try {
    payload = await response.json() as ApiEnvelope<T> | ApiErrorPayload
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : null
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `リクエストに失敗しました (${response.status})`,
      error?.fields,
      error?.requestId,
    )
  }

  if (!payload || !('data' in payload)) {
    throw new ApiError(response.status, 'invalid_response', 'APIレスポンスの形式が正しくありません。')
  }

  return payload.data
}
