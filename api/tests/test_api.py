import uuid

import bcrypt

from app.main import pool
from tests.conftest import make_user


def test_signup_login_and_me(client):
    u = make_user(client)
    assert client.post("/auth/login", json={"email": u["email"].upper(), "password": "secret123"}).status_code == 200
    assert client.post("/auth/login", json={"email": u["email"], "password": "errada"}).status_code == 401
    assert client.post("/auth/signup", json={"email": u["email"], "password": "secret123", "name": "x"}).status_code == 409
    me = client.get("/auth/me", headers=u["headers"]).json()
    assert me["user"]["email"] == u["email"] and me["token"]
    assert client.get("/auth/me").status_code == 401


def test_supabase_bcrypt_hash_is_accepted(client):
    # Supabase grava "$2a$10$..." — usuários migrados precisam logar com a senha antiga.
    h = bcrypt.hashpw(b"senhaantiga", bcrypt.gensalt(rounds=10, prefix=b"2a")).decode()
    with pool.connection() as conn:
        conn.execute("INSERT INTO users (email, name, password_hash) VALUES ('migrado@test.com', 'M', %s)", (h,))
    assert client.post("/auth/login", json={"email": "migrado@test.com", "password": "senhaantiga"}).status_code == 200


def test_full_offline_style_flow(client, checklist):
    u = make_user(client)
    h = u["headers"]
    aid = str(uuid.uuid4())
    it1, it2 = checklist["items"]

    assert len(client.get("/checklists/default", headers=h).json()["sections"][0]["items"]) == 2

    body = {"checklist_id": checklist["id"], "location": "Padaria", "started_at": "2026-11-01T10:00:00Z"}
    assert client.put(f"/audits/{aid}", json=body, headers=h).status_code == 200
    assert client.put(f"/audits/{aid}", json=body, headers=h).status_code == 200  # idempotente

    new = [{"checklist_item_id": it1, "result": "conforme", "observation": "novo", "updated_at": "2026-11-01T10:05:00Z"}]
    old = [{"checklist_item_id": it1, "result": "nao_conforme", "observation": "velho", "updated_at": "2026-11-01T10:01:00Z"}]
    client.put(f"/audits/{aid}/items", json=new, headers=h)
    client.put(f"/audits/{aid}/items", json=old, headers=h)  # reenvio atrasado não pode sobrescrever
    item = client.get(f"/audits/{aid}", headers=h).json()["items"][0]
    assert item["result"] == "conforme" and item["observation"] == "novo"

    r = client.post(f"/audits/{aid}/finalize", json={}, headers=h)
    assert r.status_code == 409 and r.json()["detail"]["answered"] == 1

    img_id = str(uuid.uuid4())
    files = {"file": ("foto.jpg", b"\xff\xd8\xff fake jpeg", "image/jpeg")}
    r1 = client.put(f"/audits/{aid}/items/{it2}/images/{img_id}", files=files, headers=h)
    r2 = client.put(f"/audits/{aid}/items/{it2}/images/{img_id}", files=files, headers=h)
    assert r1.status_code == r2.status_code == 200
    url = r1.json()["url"]
    got = client.get(url)
    assert got.content == b"\xff\xd8\xff fake jpeg"
    assert got.headers["access-control-allow-origin"] == "*"  # PDF usa a foto no canvas
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403

    # a foto criou o audit_item com data "epoch": a resposta real vence
    client.put(f"/audits/{aid}/items", json=[{"checklist_item_id": it2, "result": "nao_aplicavel",
                                              "updated_at": "2026-11-01T10:06:00Z"}], headers=h)
    full = client.get(f"/audits/{aid}", headers=h).json()
    by_id = {i["checklist_item_id"]: i for i in full["items"]}
    assert by_id[it2]["result"] == "nao_aplicavel" and len(by_id[it2]["images"]) == 1

    assert client.post(f"/audits/{aid}/finalize", json={}, headers=h).status_code == 200
    assert client.post(f"/audits/{aid}/finalize", json={}, headers=h).status_code == 200  # idempotente
    listed = client.get("/audits", headers=h).json()
    assert listed[0]["status"] == "completed" and listed[0]["compliance"] == 100
    assert listed[0]["location_name"] == "Padaria"


def test_permissions(client, checklist):
    owner, other, admin = make_user(client), make_user(client), make_user(client, "admin")
    aid = str(uuid.uuid4())
    client.put(f"/audits/{aid}", json={"checklist_id": checklist["id"], "location": "X"}, headers=owner["headers"])

    assert client.get(f"/audits/{aid}", headers=other["headers"]).status_code == 403
    assert client.put(f"/audits/{aid}", json={"checklist_id": checklist["id"]}, headers=other["headers"]).status_code == 403
    assert all(a["id"] != aid for a in client.get("/audits", headers=other["headers"]).json())

    assert client.get(f"/audits/{aid}", headers=admin["headers"]).status_code == 200
    assert any(a["id"] == aid for a in client.get("/audits", headers=admin["headers"]).json())
    # admin lê tudo, mas não escreve na auditoria de outro
    assert client.put(f"/audits/{aid}/items", json=[], headers=admin["headers"]).status_code == 403

    r = client.post("/admin/reset-password", json={"email": owner["email"], "new_password": "nova123"},
                    headers=other["headers"])
    assert r.status_code == 403
    r = client.post("/admin/reset-password", json={"email": owner["email"], "new_password": "nova123"},
                    headers=admin["headers"])
    assert r.status_code == 200
    assert client.post("/auth/login", json={"email": owner["email"], "password": "nova123"}).status_code == 200
