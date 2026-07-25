# Serene backend test suite

## Run tests

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
```

No Postgres required — tests use an in-memory async SQLite database via aiosqlite.

## Note on existing Docker volumes

The User model now has a nullable `expo_push_token` column.  If you are running
against an existing Postgres volume that predates this change, drop the volume
so `create_all` can add the column on next startup:

```bash
docker compose down -v
docker compose up
```
