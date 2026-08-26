import type { Context } from 'hono'
import type { ApiErrorPayload, ApiEnvelope } from '../../shared/contracts'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const ok = <T>(c: Context, data: T, status = 200) => {
  const payload: ApiEnvelope<T> = { data }
  return c.json(payload, status as never)
}

export const errorPayload = (
  code: string,
  message: string,
  requestId?: string,
  fields?: Record<string, string>,
): ApiErrorPayload => ({
  error: {
    code,
    message,
    ...(requestId ? { requestId } : {}),
    ...(fields ? { fields } : {}),
  },
})

export async function readJson<T>(c: Context): Promise<T> {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AppError(415, 'unsupported_media_type', 'Content-Type は application/json を指定してください。')
  }

  try {
    return await c.req.json() as T
  } catch {
    throw new AppError(400, 'invalid_json', 'JSONの形式が正しくありません。')
  }
}
