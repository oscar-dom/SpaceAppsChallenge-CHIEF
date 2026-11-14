# `src/middlewares`: validation and error handling

Pieces that run around every request. Global middlewares (helmet, CORS, JSON body,
request logging) are set up in [`app.ts`](../app.ts); this folder holds our own.

| File | Exports | What it does |
| --- | --- | --- |
| `validate.ts` | `parseInput(schema, input)` | Parses `req.params`, `req.query` or `req.body` with a zod schema and returns it typed, or throws a `ValidationError` (400) with the first problem, e.g. `crewId: Invalid crew member id` |
| `error-handler.ts` | `notFound`, `errorHandler` | Last two middlewares of the app: unknown routes answer 404, and every thrown error becomes an `ApiError` body |

## Request pipeline (`app.ts`)

```
helmet → cors(CORS_ORIGIN) → express.json(100 kb) → pino-http (logs each request)
  → GET /health
  → /api routes (routes/index.ts) → controller → parseInput(...) → service
  → notFound          (no route matched)
  → errorHandler      (anything thrown above)
```

## `errorHandler` mapping

| Error | Status | `code` |
| --- | --- | --- |
| `AppError` and subclasses (`src/errors`) | its own | its own |
| Invalid JSON body (`express.json`) | 400 | `INVALID_BODY` |
| Body too large (JSON over 100 kb, audio over 10 MB) | 413 | `PAYLOAD_TOO_LARGE` |
| Anything else | 500 | `INTERNAL_ERROR` (logged, details hidden) |

## Why `parseInput` is a function and not a middleware

Calling it inside the controller returns the parsed value **with its type**
(`const { crewId } = parseInput(crewParams, req.params)`), and zod defaults are applied
(e.g. `period` defaults to `day`). A middleware could only validate and would leave
`req.query` untyped.
