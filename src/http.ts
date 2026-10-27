import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { createFactory } from 'hono/factory';
import { validator } from 'hono/validator';
import type { z } from 'zod';

type AppEnv = { Bindings: Env };
export const factory = createFactory<AppEnv>();
export const errorBody = (code: string, message: string) => ({ error: { code, message } });

export const publicJson = factory.createMiddleware(async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  await next();
});

export const authenticateIngest = factory.createMiddleware(async (c, next) => {
  if (!c.env.INGEST_TOKEN || c.env.INGEST_TOKEN.length < 32) {
    return c.json(errorBody('SERVICE_UNAVAILABLE', 'Service temporarily unavailable.'), 503);
  }
  const unauthorized = errorBody('UNAUTHORIZED', 'Bearer authentication required.');
  return bearerAuth<AppEnv>({
    token: c.env.INGEST_TOKEN,
    noAuthenticationHeader: { message: unauthorized },
    invalidAuthenticationHeader: { message: unauthorized },
    invalidToken: { message: unauthorized },
  })(c, next);
});

export function limitBody(maxSize: number) {
  const limit = bodyLimit({
    maxSize,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', `Body exceeds ${maxSize} bytes.`), 413),
  });
  return factory.createMiddleware((c, next) => {
    // Force bodyLimit to count actual bytes instead of trusting Content-Length.
    c.req.raw = new Request(c.req.raw);
    c.req.raw.headers.delete('Content-Length');
    return limit(c, next);
  });
}

export const requireJson = factory.createMiddleware(async (c, next) => {
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return c.json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.'), 415);
  }
  await next();
});

export function jsonInput<T extends object>(schema: z.ZodType<T>, invalid: ReturnType<typeof errorBody>) {
  return factory.createMiddleware<{ out: { json: T } }>(async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('INVALID_JSON', 'Body must be valid JSON.'), 400);
    }
    const result = schema.safeParse(body);
    if (!result.success) return c.json(invalid, 400);
    c.req.addValidatedData('json', result.data);
    await next();
  });
}

export function queryInput<T>(schema: z.ZodType<T>) {
  return validator('query', (query, c) => {
    const result = schema.safeParse(query);
    if (!result.success) return c.json(errorBody('INVALID_QUERY', 'Invalid query parameters.'), 400);
    return result.data;
  });
}
