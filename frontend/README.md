# CHIEF · Monitorización de Salud de la Tripulación (Frontend Svelte)

Aplicación SPA en Svelte alineada con `api-contract-v3.md`.

## Arranque rápido

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Arranca el servidor de desarrollo (por defecto usa los mocks completos en `src/mocks/`):
   ```bash
   npm run dev
   ```
3. Abre `http://localhost:5173`.

## Conectar con el backend real (Node + SSE + Agente IA)

Edita `.env` y cambia `VITE_USE_MOCKS` a `false`:

```env
VITE_API_URL=http://localhost:3000/api
VITE_USE_MOCKS=false
```

Al poner `VITE_USE_MOCKS=false`, la aplicación:
- Consulta los endpoints REST (`GET /mission/status`, `GET /crew`, `GET /crew/:id/overview`, etc.).
- Abre el canal único en tiempo real `GET /api/stream` (`EventSource`) con reconexión automática tras 45 s sin latido.
- Envía acciones idempotentes (`clientId`) en `POST` y `PATCH`, con cola offline y caché en IndexedDB.
- Conecta el **Copiloto IA** mediante `POST /api/copilot/chat` en streaming (`fetch` + `getReader()`).
