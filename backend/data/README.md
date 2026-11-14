# `data/`

The local SQLite database lives here. **It is not committed to Git** (it is in `.gitignore`):

| File | What it is |
| --- | --- |
| `chief.db` | The backend's working database (with its `-wal` and `-shm` files while open) |
| `chief.base.db` | Clean copy of the initial state, for `npm run db:restore` between demos |

Both are generated with `npm run db:reset` (see [`src/db/README.md`](../src/db/README.md)). If you copy
`chief.db` by hand while the backend is running you will lose data: use `VACUUM INTO`, or stop the
backend first.
