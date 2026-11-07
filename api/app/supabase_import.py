"""Migração do Supabase antigo sem a senha do banco.

- Checklist: as tabelas do checklist são públicas no Supabase -> importadas na subida da API.
- Usuários: no primeiro login de quem ainda não existe aqui, a senha é conferida no Supabase
  (GoTrue). Se estiver certa, a conta é criada com o MESMO id e a mesma senha (hash bcrypt novo).
- Dados: com o token daquela sessão, as tabelas são lidas pela API REST do Supabase respeitando
  o RLS (cada um vê o seu; admin vê tudo) e copiadas para cá. Fotos vêm pela URL pública do bucket.

Tudo é idempotente (ON CONFLICT DO NOTHING / ids preservados).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

log = logging.getLogger("bpfcheck.supabase")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # chave pública (publishable/anon)
ENABLED = bool(SUPABASE_URL and SUPABASE_KEY)
PAGE = 1000
VALID_RESULTS = {"conforme", "nao_conforme", "nao_aplicavel"}
# Marca de senha "ainda não migrada": nunca bate com bcrypt.
UNMIGRATED_HASH = "!supabase"


def _request(method: str, path: str, token: Optional[str] = None, body: Optional[dict] = None, timeout: int = 30):
    headers = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read() or b"null")


def _select_all(table: str, token: Optional[str] = None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        page = _request("GET", f"/rest/v1/{table}?select=*&limit={PAGE}&offset={offset}", token)
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def supabase_sign_in(email: str, password: str) -> Optional[dict]:
    """Confere e-mail/senha no Supabase. Devolve {access_token, user} ou None se inválido."""
    if not ENABLED:
        return None
    try:
        return _request("POST", "/auth/v1/token?grant_type=password",
                        body={"email": email, "password": password}, timeout=15)
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 401, 422):
            return None
        raise


def import_public_checklists(conn) -> int:
    """Importa checklist/seções/itens (públicos no Supabase). Retorna quantos itens existem."""
    if not ENABLED:
        return 0
    for r in _select_all("checklists"):
        conn.execute("""INSERT INTO checklists (id, name, description, is_default, created_at)
                        VALUES (%s, %s, %s, COALESCE(%s, false), COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                     (r["id"], r["name"], r.get("description"), r.get("is_default"), r.get("created_at")))
    for r in _select_all("checklist_sections"):
        conn.execute("""INSERT INTO checklist_sections (id, checklist_id, title, order_index, created_at)
                        VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                     (r["id"], r["checklist_id"], r["title"], r["order_index"], r.get("created_at")))
    for r in _select_all("checklist_items"):
        conn.execute("""INSERT INTO checklist_items (id, section_id, description, order_index, created_at)
                        VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                     (r["id"], r["section_id"], r["description"], r["order_index"], r.get("created_at")))
    return conn.execute("SELECT count(*) AS n FROM checklist_items").fetchone()["n"]


def _ensure_user(conn, user_id: str, profiles: dict) -> None:
    """Garante uma linha de usuário para auditorias de terceiros (vistas pelo admin).
    Ela recebe a senha de verdade quando a pessoa fizer o primeiro login."""
    p = profiles.get(user_id) or {}
    email = (p.get("email") or f"{user_id}@migrado.invalid").lower()
    if conn.execute("SELECT 1 FROM users WHERE lower(email) = %s AND id <> %s", (email, user_id)).fetchone():
        email = f"{user_id}@migrado.invalid"
    conn.execute("""INSERT INTO users (id, email, name, password_hash) VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING""", (user_id, email, p.get("name"), UNMIGRATED_HASH))


def import_user_data(conn, token: str) -> dict:
    """Copia tudo que esta sessão do Supabase enxerga (RLS). Retorna contagens e a lista de fotos."""
    profiles = {p["id"]: p for p in _select_all("profiles", token)}
    locations = _select_all("audit_locations", token)
    audits = _select_all("audits", token)
    items = _select_all("audit_items", token)
    images = _select_all("audit_item_images", token)

    for uid in {r["user_id"] for r in locations} | {r["user_id"] for r in audits}:
        _ensure_user(conn, uid, profiles)

    for r in locations:
        conn.execute("""INSERT INTO audit_locations (id, user_id, name, address, city, state, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                     (r["id"], r["user_id"], r["name"], r.get("address"), r.get("city"), r.get("state"),
                      r.get("created_at")))
    known_checklists = {str(x["id"]) for x in conn.execute("SELECT id FROM checklists").fetchall()}
    audit_ids = set()
    for r in audits:
        if str(r["checklist_id"]) not in known_checklists:
            continue
        status = "completed" if r.get("status") == "completed" else "in_progress"
        conn.execute("""INSERT INTO audits (id, user_id, checklist_id, location, location_id, status,
                                            started_at, finished_at)
                        VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, now()), %s) ON CONFLICT DO NOTHING""",
                     (r["id"], r["user_id"], r["checklist_id"], r.get("location"), r.get("location_id"),
                      status, r.get("started_at"), r.get("finished_at")))
        audit_ids.add(r["id"])
    item_audit = {}
    for r in items:
        if r["audit_id"] not in audit_ids:
            continue
        result = r.get("result") if r.get("result") in VALID_RESULTS else None
        conn.execute("""INSERT INTO audit_items (id, audit_id, checklist_item_id, result, observation, updated_at)
                        VALUES (%s, %s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                     (r["id"], r["audit_id"], r["checklist_item_id"], result, r.get("observation"),
                      r.get("updated_at")))
        item_audit[r["id"]] = r["audit_id"]
    owner = {r["id"]: r["user_id"] for r in audits}
    pending_photos = [
        {"id": r["id"], "audit_item_id": r["audit_item_id"], "url": r["image_url"],
         "audit_id": item_audit[r["audit_item_id"]], "user_id": owner[item_audit[r["audit_item_id"]]],
         "created_at": r.get("created_at")}
        for r in images if r["audit_item_id"] in item_audit
    ]
    return {"audits": len(audit_ids), "items": len(item_audit), "photos": pending_photos}


def download_photos(pool, photos: list[dict], upload_dir: Path) -> None:
    """Baixa as fotos (bucket público do Supabase) em segundo plano e registra no banco."""
    def run():
        ok = failed = 0
        for p in photos:
            try:
                with pool.connection() as conn:
                    if conn.execute("SELECT 1 FROM audit_item_images WHERE id = %s", (p["id"],)).fetchone():
                        continue
                with urllib.request.urlopen(p["url"], timeout=60) as resp:
                    data = resp.read()
                    ctype = resp.headers.get_content_type() or "image/jpeg"
                ext = {"image/png": "png", "image/webp": "webp"}.get(ctype, "jpg")
                if ext == "jpg":
                    ctype = "image/jpeg"
                rel = f"{p['user_id']}/{p['audit_id']}/{p['id']}.{ext}"
                dest = upload_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                with pool.connection() as conn:
                    conn.execute("""INSERT INTO audit_item_images (id, audit_item_id, file_path, content_type, created_at)
                                    VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                                 (p["id"], p["audit_item_id"], rel, ctype, p.get("created_at")))
                ok += 1
            except Exception as exc:  # noqa: BLE001 — uma foto ruim não interrompe as outras
                failed += 1
                log.warning("foto %s não migrada: %s", p["id"], exc)
        log.info("fotos migradas: %d ok, %d falharam", ok, failed)

    if photos:
        threading.Thread(target=run, daemon=True).start()
