"""Sobe um Postgres embutido (pgserver) e a API com TestClient — não precisa de Docker."""
import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_tmp = tempfile.mkdtemp(prefix="bpfcheck-test-")
import pgserver  # noqa: E402

_pg = pgserver.get_server(os.path.join(_tmp, "pg"), cleanup_mode="delete")
os.environ["DATABASE_URL"] = _pg.get_uri()
os.environ["JWT_SECRET"] = "test-secret"
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")
os.environ["PUBLIC_URL"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app, pool  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def checklist(client):
    """Checklist mínimo: 1 seção, 2 itens."""
    cid, sid = uuid.uuid4(), uuid.uuid4()
    items = [uuid.uuid4(), uuid.uuid4()]
    with pool.connection() as conn:
        conn.execute("INSERT INTO checklists (id, name, is_default) VALUES (%s, 'RDC 216', true)", (cid,))
        conn.execute("INSERT INTO checklist_sections (id, checklist_id, title, order_index) VALUES (%s, %s, 'S1', 1)",
                     (sid, cid))
        for i, it in enumerate(items):
            conn.execute("INSERT INTO checklist_items (id, section_id, description, order_index) VALUES (%s,%s,%s,%s)",
                         (it, sid, f"item {i}", i))
    return {"id": str(cid), "items": [str(i) for i in items]}


def make_user(client, role="user"):
    email = f"{uuid.uuid4().hex[:8]}@test.com"
    r = client.post("/auth/signup", json={"email": email, "password": "secret123", "name": "Teste"})
    assert r.status_code == 200, r.text
    if role == "admin":
        with pool.connection() as conn:
            conn.execute("UPDATE users SET role = 'admin' WHERE email = %s", (email,))
    return {"email": email, "headers": {"Authorization": f"Bearer {r.json()['token']}"}}
