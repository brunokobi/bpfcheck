"""Migra os dados do Supabase antigo para o Postgres próprio do BPF Check.

Roda DENTRO do container da API (já tem psycopg, DATABASE_URL e o volume de uploads):

    docker compose exec -e SUPABASE_DB_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \
        bpfcheck-api python scripts/migrate_from_supabase.py [--dry-run]

- Usuários mantêm a mesma senha (o hash bcrypt do auth.users é copiado).
- Ids são preservados; rodar de novo é seguro (ON CONFLICT DO NOTHING).
- Fotos são baixadas pela URL pública do bucket antigo e gravadas no volume.
"""
from __future__ import annotations

import os
import secrets
import sys
import urllib.request
from pathlib import Path

import bcrypt
import psycopg
from psycopg.rows import dict_row

SRC = os.environ["SUPABASE_DB_URL"]
DST = os.environ["DATABASE_URL"]
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/data/uploads"))
DRY = "--dry-run" in sys.argv
VALID_RESULTS = {"conforme", "nao_conforme", "nao_aplicavel"}


def main() -> None:
    src = psycopg.connect(SRC, row_factory=dict_row)
    dst = psycopg.connect(DST, row_factory=dict_row)
    dst.execute((Path(__file__).resolve().parent.parent / "schema.sql").read_text())

    users = src.execute("""
        SELECT u.id, u.email, u.encrypted_password, u.created_at,
               COALESCE(p.name, u.raw_user_meta_data->>'name') AS name,
               EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
        FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
        WHERE u.email IS NOT NULL
    """).fetchall()
    for u in users:
        pw = u["encrypted_password"] or bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt()).decode()
        dst.execute(
            """INSERT INTO users (id, email, name, password_hash, role, created_at)
               VALUES (%s, lower(%s), %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
            (u["id"], u["email"], u["name"], pw, "admin" if u["is_admin"] else "user", u["created_at"]))
    print(f"users: {len(users)} (sem senha → precisam de reset: "
          f"{sum(1 for u in users if not u['encrypted_password'])})")

    rows = src.execute("SELECT * FROM public.checklists").fetchall()
    for r in rows:
        dst.execute("""INSERT INTO checklists (id, name, description, is_default, created_at)
                       VALUES (%s, %s, %s, COALESCE(%s, false), COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["name"], r["description"], r["is_default"], r["created_at"]))
    print(f"checklists: {len(rows)}")

    rows = src.execute("SELECT * FROM public.checklist_sections").fetchall()
    for r in rows:
        dst.execute("""INSERT INTO checklist_sections (id, checklist_id, title, order_index, created_at)
                       VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["checklist_id"], r["title"], r["order_index"], r["created_at"]))
    print(f"checklist_sections: {len(rows)}")

    rows = src.execute("SELECT * FROM public.checklist_items").fetchall()
    for r in rows:
        dst.execute("""INSERT INTO checklist_items (id, section_id, description, order_index, created_at)
                       VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["section_id"], r["description"], r["order_index"], r["created_at"]))
    print(f"checklist_items: {len(rows)}")

    user_ids = {u["id"] for u in users}

    rows = src.execute("SELECT * FROM public.audit_locations").fetchall()
    rows = [r for r in rows if r["user_id"] in user_ids]
    for r in rows:
        dst.execute("""INSERT INTO audit_locations (id, user_id, name, address, city, state, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["user_id"], r["name"], r["address"], r["city"], r["state"], r["created_at"]))
    print(f"audit_locations: {len(rows)}")

    rows = src.execute("SELECT * FROM public.audits").fetchall()
    rows = [r for r in rows if r["user_id"] in user_ids]
    for r in rows:
        status = "completed" if r["status"] == "completed" else "in_progress"
        dst.execute("""INSERT INTO audits (id, user_id, checklist_id, location, location_id, status,
                                           started_at, finished_at)
                       VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, now()), %s) ON CONFLICT DO NOTHING""",
                    (r["id"], r["user_id"], r["checklist_id"], r["location"], r["location_id"], status,
                     r["started_at"], r["finished_at"]))
    audit_ids = {r["id"] for r in rows}
    print(f"audits: {len(rows)}")

    rows = src.execute("SELECT * FROM public.audit_items").fetchall()
    rows = [r for r in rows if r["audit_id"] in audit_ids]
    for r in rows:
        result = r["result"] if r["result"] in VALID_RESULTS else None
        dst.execute("""INSERT INTO audit_items (id, audit_id, checklist_item_id, result, observation, updated_at)
                       VALUES (%s, %s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["audit_id"], r["checklist_item_id"], result, r["observation"], r["updated_at"]))
    print(f"audit_items: {len(rows)}")

    rows = src.execute("""
        SELECT img.id, img.audit_item_id, img.image_url, img.created_at, a.id AS audit_id, a.user_id
        FROM public.audit_item_images img
        JOIN public.audit_items ai ON ai.id = img.audit_item_id
        JOIN public.audits a ON a.id = ai.audit_id
    """).fetchall()
    ok = failed = 0
    for r in rows:
        if r["audit_id"] not in audit_ids:
            continue
        if dst.execute("SELECT 1 FROM audit_item_images WHERE id = %s", (r["id"],)).fetchone():
            ok += 1
            continue
        try:
            with urllib.request.urlopen(r["image_url"], timeout=60) as resp:
                data = resp.read()
                ctype = resp.headers.get_content_type() or "image/jpeg"
        except Exception as exc:  # noqa: BLE001 — registra e segue com as outras fotos
            print(f"  ! foto {r['id']} falhou: {exc}")
            failed += 1
            continue
        ext = {"image/png": "png", "image/webp": "webp"}.get(ctype, "jpg")
        rel = f"{r['user_id']}/{r['audit_id']}/{r['id']}.{ext}"
        if not DRY:
            dest = UPLOAD_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        dst.execute("""INSERT INTO audit_item_images (id, audit_item_id, file_path, content_type, created_at)
                       VALUES (%s, %s, %s, %s, COALESCE(%s, now())) ON CONFLICT DO NOTHING""",
                    (r["id"], r["audit_item_id"], rel, ctype, r["created_at"]))
        ok += 1
    print(f"audit_item_images: {ok} ok, {failed} falharam")

    if DRY:
        dst.rollback()
        print("dry-run: nada gravado")
    else:
        dst.commit()
        print("migração concluída")


if __name__ == "__main__":
    main()
