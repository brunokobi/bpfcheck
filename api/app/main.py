"""BPF Check API — substitui o Supabase (auth, banco e storage) na vpsrafa.

Toda escrita é idempotente (PUT com id gerado no aparelho), para a fila offline
do app poder reenviar qualquer operação sem duplicar dados.
"""
from __future__ import annotations

import hashlib
import logging
import hmac
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

import bcrypt
import jwt
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, EmailStr, Field

from app import supabase_import as sb

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/data/uploads"))
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "https://bpfcheck.netlify.app,http://localhost:8080"
).split(",") if o.strip()]
TOKEN_DAYS = int(os.environ.get("TOKEN_DAYS", "60"))
MAX_IMAGE_BYTES = 15 * 1024 * 1024
SIGNED_URL_DAYS = 7
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False,
                      kwargs={"row_factory": dict_row, "autocommit": False})


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open(wait=True)
    schema = (Path(__file__).resolve().parent.parent / "schema.sql").read_text()
    with pool.connection() as conn:
        conn.execute(schema)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Checklist RDC 216 vem do Supabase antigo (tabelas públicas) enquanto o banco estiver vazio.
    if sb.ENABLED:
        try:
            with pool.connection() as conn:
                if not conn.execute("SELECT 1 FROM checklist_items LIMIT 1").fetchone():
                    sb.import_public_checklists(conn)
        except Exception:  # noqa: BLE001 — a API sobe mesmo se o Supabase estiver fora
            sb.log.exception("falha ao importar checklist do Supabase")
    yield
    pool.close()


app = FastAPI(title="BPF Check API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


# ───────────────────────────── auth ─────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def check_password(password: str, hashed: str) -> bool:
    try:
        # Supabase usa bcrypt "$2a$" — compatível com o bcrypt do Python.
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET, algorithm="HS256")


def public_user(row: dict) -> dict:
    return {"id": str(row["id"]), "email": row["email"], "name": row["name"], "role": row["role"]}


def current_user(request: Request) -> dict:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "not_authenticated")
    try:
        payload = jwt.decode(header[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid_token")
    with pool.connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = %s", (payload["sub"],)).fetchone()
    if not row:
        raise HTTPException(401, "user_not_found")
    return row


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/signup")
def signup(body: SignupIn):
    with pool.connection() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE lower(email) = lower(%s)", (body.email,)).fetchone()
        if exists:
            raise HTTPException(409, "email_taken")
        row = conn.execute(
            "INSERT INTO users (email, name, password_hash, supabase_imported) VALUES (%s, %s, %s, true) RETURNING *",
            (body.email.lower(), body.name.strip(), hash_password(body.password)),
        ).fetchone()
    return {"token": make_token(str(row["id"])), "user": public_user(row)}


# Limite de tentativas de login por e-mail (em memória: a API roda com 1 processo).
LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW_S = 15 * 60
_login_failures: dict[str, list[float]] = {}


def _recent_failures(email: str) -> list[float]:
    cutoff = time.time() - LOGIN_WINDOW_S
    recent = [t for t in _login_failures.get(email, []) if t > cutoff]
    if recent:
        _login_failures[email] = recent
    else:
        _login_failures.pop(email, None)
    return recent


@app.post("/auth/login")
def login(body: LoginIn):
    email = body.email.lower()
    if len(_recent_failures(email)) >= LOGIN_MAX_FAILURES:
        raise HTTPException(429, "too_many_attempts")
    with pool.connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = lower(%s)", (email,)).fetchone()
    if row and row["password_hash"] != sb.UNMIGRATED_HASH and check_password(body.password, row["password_hash"]):
        _login_failures.pop(email, None)
        if sb.ENABLED and not row["supabase_imported"]:
            _import_supabase_data(email, body.password)  # tentativa anterior falhou: tenta de novo
        return {"token": make_token(str(row["id"])), "user": public_user(row)}
    if sb.ENABLED and (not row or row["password_hash"] == sb.UNMIGRATED_HASH):
        migrated = _migrate_from_supabase(email, body.password)
        if migrated:
            _login_failures.pop(email, None)
            return {"token": make_token(str(migrated["id"])), "user": public_user(migrated)}
    _login_failures.setdefault(email, []).append(time.time())
    raise HTTPException(401, "invalid_credentials")


def _migrate_from_supabase(email: str, password: str) -> Optional[dict]:
    """Primeiro login de quem vem do Supabase: confere a senha lá e traz conta + dados."""
    try:
        session = sb.supabase_sign_in(email, password)
    except Exception:  # noqa: BLE001
        sb.log.exception("Supabase indisponível no login de migração")
        raise HTTPException(503, "migration_unavailable")
    if not session:
        return None
    token = session["access_token"]
    sb_user = session["user"]
    uid = sb_user["id"]
    name = (sb_user.get("user_metadata") or {}).get("name")
    try:
        roles = sb._select_all("user_roles", token)
        is_admin = any(r.get("user_id") == uid and r.get("role") == "admin" for r in roles)
    except Exception:  # noqa: BLE001
        is_admin = False
    with pool.connection() as conn:
        row = conn.execute(
            """INSERT INTO users (id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
                   name = COALESCE(EXCLUDED.name, users.name),
                   password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
               RETURNING *""",
            (uid, email, name, hash_password(password), "admin" if is_admin else "user")).fetchone()
    _import_supabase_data(email, password, token)
    return row


def _import_supabase_data(email: str, password: str, token: Optional[str] = None) -> None:
    """Copia os dados que a sessão do Supabase enxerga. Falha não bloqueia o login:
    `supabase_imported` fica false e a cópia é tentada de novo no próximo login."""
    try:
        if token is None:
            session = sb.supabase_sign_in(email, password)
            if not session:  # sem conta (ou senha diferente) no Supabase: nada a importar
                with pool.connection() as conn:
                    conn.execute("UPDATE users SET supabase_imported = true WHERE lower(email) = lower(%s)", (email,))
                return
            token = session["access_token"]
        with pool.connection() as conn:
            if not conn.execute("SELECT 1 FROM checklist_items LIMIT 1").fetchone():
                sb.import_public_checklists(conn)
            result = sb.import_user_data(conn, token)
            conn.execute("UPDATE users SET supabase_imported = true WHERE lower(email) = lower(%s)", (email,))
        sb.log.info("migrado %s: %d auditorias, %d respostas, %d fotos na fila",
                    email, result["audits"], result["items"], len(result["photos"]))
        sb.download_photos(pool, result["photos"], UPLOAD_DIR)
    except Exception:  # noqa: BLE001
        sb.log.exception("falha ao migrar dados de %s (nova tentativa no próximo login)", email)


@app.get("/auth/me")
def me(user: dict = Depends(current_user)):
    # Devolve um token novo: quem abre o app online com frequência nunca expira.
    return {"token": make_token(str(user["id"])), "user": public_user(user)}


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


@app.post("/auth/password")
def change_password(body: PasswordIn, user: dict = Depends(current_user)):
    if not check_password(body.current_password, user["password_hash"]):
        raise HTTPException(401, "invalid_credentials")
    with pool.connection() as conn:
        conn.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                     (hash_password(body.new_password), user["id"]))
    return {"ok": True}


class AdminPasswordIn(BaseModel):
    email: EmailStr
    new_password: str = Field(min_length=6)


@app.post("/admin/reset-password")
def admin_reset_password(body: AdminPasswordIn, user: dict = Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "forbidden")
    with pool.connection() as conn:
        cur = conn.execute("UPDATE users SET password_hash = %s WHERE lower(email) = lower(%s)",
                           (hash_password(body.new_password), body.email))
        if cur.rowcount == 0:
            raise HTTPException(404, "user_not_found")
    return {"ok": True}


# ─────────────────────────── checklist ───────────────────────────

@app.get("/checklists/{checklist_id}")
def get_checklist(checklist_id: str, _: dict = Depends(current_user)):
    """`checklist_id` = uuid, ou "default" para o checklist padrão."""
    with pool.connection() as conn:
        if checklist_id == "default":
            checklist = conn.execute(
                "SELECT id, name, description FROM checklists ORDER BY is_default DESC, created_at LIMIT 1"
            ).fetchone()
        else:
            try:
                uuid.UUID(checklist_id)
            except ValueError:
                raise HTTPException(404, "no_checklist")
            checklist = conn.execute(
                "SELECT id, name, description FROM checklists WHERE id = %s", (checklist_id,)).fetchone()
        if not checklist:
            raise HTTPException(404, "no_checklist")
        sections = conn.execute(
            "SELECT id, title, order_index FROM checklist_sections WHERE checklist_id = %s ORDER BY order_index",
            (checklist["id"],),
        ).fetchall()
        items = conn.execute(
            """SELECT ci.id, ci.section_id, ci.description, ci.order_index
               FROM checklist_items ci JOIN checklist_sections cs ON cs.id = ci.section_id
               WHERE cs.checklist_id = %s ORDER BY ci.order_index""",
            (checklist["id"],),
        ).fetchall()
    by_section: dict = {}
    for it in items:
        by_section.setdefault(it["section_id"], []).append(
            {"id": str(it["id"]), "description": it["description"], "order_index": it["order_index"]})
    return {
        "id": str(checklist["id"]),
        "name": checklist["name"],
        "description": checklist["description"],
        "sections": [{"id": str(s["id"]), "title": s["title"], "order_index": s["order_index"],
                      "items": by_section.get(s["id"], [])} for s in sections],
    }


# ──────────────────────────── audits ────────────────────────────

AUDIT_LIST_SQL = """
SELECT a.id, a.user_id, a.checklist_id, a.location, a.location_id, a.status,
       a.started_at, a.finished_at, a.updated_at,
       COALESCE(l.name, a.location) AS location_name,
       COALESCE(u.name, u.email) AS auditor_name,
       COUNT(ai.id) FILTER (WHERE ai.result = 'conforme')      AS conforme_count,
       COUNT(ai.id) FILTER (WHERE ai.result = 'nao_conforme')  AS nao_conforme_count,
       COUNT(ai.id) FILTER (WHERE ai.result = 'nao_aplicavel') AS nao_aplicavel_count
FROM audits a
JOIN users u ON u.id = a.user_id
LEFT JOIN audit_locations l ON l.id = a.location_id
LEFT JOIN audit_items ai ON ai.audit_id = a.id
WHERE (%(admin)s OR a.user_id = %(uid)s)
GROUP BY a.id, l.name, u.name, u.email
ORDER BY a.started_at DESC
"""


def audit_out(row: dict) -> dict:
    out = {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in row.items()}
    c, nc = row.get("conforme_count") or 0, row.get("nao_conforme_count") or 0
    out["compliance"] = round(c / (c + nc) * 100) if row.get("status") == "completed" and c + nc > 0 else None
    return out


@app.get("/audits")
def list_audits(user: dict = Depends(current_user)):
    with pool.connection() as conn:
        rows = conn.execute(AUDIT_LIST_SQL, {"admin": user["role"] == "admin", "uid": user["id"]}).fetchall()
    return [audit_out(r) for r in rows]


def load_audit(conn, audit_id: uuid.UUID, user: dict, write: bool = False) -> Optional[dict]:
    row = conn.execute("SELECT * FROM audits WHERE id = %s", (audit_id,)).fetchone()
    if not row:
        return None
    is_owner = row["user_id"] == user["id"]
    if not is_owner and (write or user["role"] != "admin"):
        raise HTTPException(403, "forbidden")
    return row


def sign_file(image_id: str) -> str:
    # Expiração arredondada para o dia: a URL fica estável e o navegador consegue cachear.
    exp = (int(time.time()) // 86400 + SIGNED_URL_DAYS) * 86400
    sig = hmac.new(JWT_SECRET.encode(), f"{image_id}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{PUBLIC_URL}/files/{image_id}?exp={exp}&sig={sig}"


@app.get("/audits/{audit_id}")
def get_audit(audit_id: uuid.UUID, user: dict = Depends(current_user)):
    with pool.connection() as conn:
        if not load_audit(conn, audit_id, user):
            raise HTTPException(404, "audit_not_found")
        sql = AUDIT_LIST_SQL.replace("WHERE (%(admin)s OR a.user_id = %(uid)s)", "WHERE a.id = %(id)s")
        audit = audit_out(conn.execute(sql, {"id": audit_id}).fetchone())
        loc = conn.execute(
            """SELECT l.name, l.address, l.city, l.state FROM audits a
               JOIN audit_locations l ON l.id = a.location_id WHERE a.id = %s""", (audit_id,)).fetchone()
        items = conn.execute(
            "SELECT id, checklist_item_id, result, observation, updated_at FROM audit_items WHERE audit_id = %s",
            (audit_id,)).fetchall()
        images = conn.execute(
            """SELECT img.id, ai.checklist_item_id FROM audit_item_images img
               JOIN audit_items ai ON ai.id = img.audit_item_id
               WHERE ai.audit_id = %s ORDER BY img.created_at""", (audit_id,)).fetchall()
    imgs_by_item: dict = {}
    for img in images:
        imgs_by_item.setdefault(str(img["checklist_item_id"]), []).append(
            {"id": str(img["id"]), "url": sign_file(str(img["id"]))})
    if loc:
        full = loc["name"]
        if loc["address"]:
            full += f", {loc['address']}"
        if loc["city"]:
            full += f" - {loc['city']}"
        if loc["state"]:
            full += f"/{loc['state']}"
        audit["location_full"] = full
    else:
        audit["location_full"] = audit["location_name"]
    audit["items"] = [{
        "checklist_item_id": str(i["checklist_item_id"]),
        "result": i["result"],
        "observation": i["observation"],
        "updated_at": i["updated_at"],
        "images": imgs_by_item.get(str(i["checklist_item_id"]), []),
    } for i in items]
    return audit


class AuditIn(BaseModel):
    checklist_id: uuid.UUID
    location: Optional[str] = None
    started_at: Optional[datetime] = None


def resolve_location(conn, user_id, name: Optional[str]):
    if not name or not name.strip():
        return None
    name = name.strip()
    row = conn.execute("SELECT id FROM audit_locations WHERE user_id = %s AND name = %s LIMIT 1",
                       (user_id, name)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO audit_locations (user_id, name) VALUES (%s, %s) RETURNING id",
                        (user_id, name)).fetchone()["id"]


@app.put("/audits/{audit_id}")
def upsert_audit(audit_id: uuid.UUID, body: AuditIn, user: dict = Depends(current_user)):
    with pool.connection() as conn:
        existing = load_audit(conn, audit_id, user, write=True)
        location_id = resolve_location(conn, user["id"], body.location)
        if existing:
            conn.execute(
                """UPDATE audits SET location = COALESCE(%s, location),
                       location_id = COALESCE(%s, location_id), updated_at = now() WHERE id = %s""",
                (body.location, location_id, audit_id))
        else:
            conn.execute(
                """INSERT INTO audits (id, user_id, checklist_id, location, location_id, started_at)
                   VALUES (%s, %s, %s, %s, %s, COALESCE(%s, now()))""",
                (audit_id, user["id"], body.checklist_id, body.location, location_id, body.started_at))
    return {"ok": True}


class ItemIn(BaseModel):
    checklist_item_id: uuid.UUID
    result: Optional[Literal["conforme", "nao_conforme", "nao_aplicavel"]] = None
    observation: Optional[str] = None
    updated_at: datetime


@app.put("/audits/{audit_id}/items")
def upsert_items(audit_id: uuid.UUID, items: list[ItemIn], user: dict = Depends(current_user)):
    with pool.connection() as conn:
        if not load_audit(conn, audit_id, user, write=True):
            raise HTTPException(404, "audit_not_found")
        with conn.cursor() as cur:
            # Last-write-wins pelo horário do aparelho: reenvio antigo não sobrescreve resposta nova.
            cur.executemany(
                """INSERT INTO audit_items (audit_id, checklist_item_id, result, observation, updated_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (audit_id, checklist_item_id) DO UPDATE SET
                       result = EXCLUDED.result, observation = EXCLUDED.observation,
                       updated_at = EXCLUDED.updated_at
                   WHERE audit_items.updated_at <= EXCLUDED.updated_at""",
                [(audit_id, i.checklist_item_id, i.result, i.observation, i.updated_at) for i in items])
        conn.execute("UPDATE audits SET updated_at = now() WHERE id = %s", (audit_id,))
    return {"ok": True}


class FinalizeIn(BaseModel):
    finished_at: Optional[datetime] = None


@app.post("/audits/{audit_id}/finalize")
def finalize_audit(audit_id: uuid.UUID, body: FinalizeIn, user: dict = Depends(current_user)):
    with pool.connection() as conn:
        audit = load_audit(conn, audit_id, user, write=True)
        if not audit:
            raise HTTPException(404, "audit_not_found")
        if audit["status"] == "completed":
            return {"ok": True}
        counts = conn.execute(
            """SELECT
                 (SELECT count(*) FROM checklist_items ci JOIN checklist_sections cs ON cs.id = ci.section_id
                  WHERE cs.checklist_id = %(cid)s) AS total,
                 (SELECT count(*) FROM audit_items WHERE audit_id = %(aid)s AND result IS NOT NULL) AS answered""",
            {"cid": audit["checklist_id"], "aid": audit_id}).fetchone()
        if counts["answered"] < counts["total"]:
            raise HTTPException(409, {"code": "checklist_incomplete",
                                      "answered": counts["answered"], "total": counts["total"]})
        conn.execute(
            """UPDATE audits SET status = 'completed', finished_at = COALESCE(%s, now()), updated_at = now()
               WHERE id = %s""", (body.finished_at, audit_id))
    return {"ok": True}


@app.delete("/audits/{audit_id}")
def delete_audit(audit_id: uuid.UUID, user: dict = Depends(current_user)):
    with pool.connection() as conn:
        if load_audit(conn, audit_id, user, write=True):
            conn.execute("DELETE FROM audits WHERE id = %s", (audit_id,))
    return {"ok": True}


# ──────────────────────────── images ────────────────────────────

@app.put("/audits/{audit_id}/items/{checklist_item_id}/images/{image_id}")
async def upload_image(audit_id: uuid.UUID, checklist_item_id: uuid.UUID, image_id: uuid.UUID,
                       file: UploadFile = File(...), user: dict = Depends(current_user)):
    # Só formatos raster: SVG pode conter script e seria servido pelo domínio da API.
    content_type = file.content_type or "image/jpeg"
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, "unsupported_image_type")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "image_too_large")

    with pool.connection() as conn:
        if not load_audit(conn, audit_id, user, write=True):
            raise HTTPException(404, "audit_not_found")
        if conn.execute("SELECT 1 FROM audit_item_images WHERE id = %s", (image_id,)).fetchone():
            return {"id": str(image_id), "url": sign_file(str(image_id))}

        ext = ALLOWED_IMAGE_TYPES[content_type]
        rel = f"{user['id']}/{audit_id}/{image_id}.{ext}"
        dest = UPLOAD_DIR / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(dest)

        item_id = conn.execute(
            """INSERT INTO audit_items (audit_id, checklist_item_id, updated_at)
               VALUES (%s, %s, 'epoch') ON CONFLICT (audit_id, checklist_item_id) DO UPDATE
               SET audit_id = EXCLUDED.audit_id RETURNING id""",
            (audit_id, checklist_item_id)).fetchone()["id"]
        conn.execute(
            """INSERT INTO audit_item_images (id, audit_item_id, file_path, content_type)
               VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
            (image_id, item_id, rel, content_type))
    return {"id": str(image_id), "url": sign_file(str(image_id))}


@app.get("/files/{image_id}")
def get_file(image_id: uuid.UUID, exp: int, sig: str):
    expected = hmac.new(JWT_SECRET.encode(), f"{image_id}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expected, sig) or exp < time.time():
        raise HTTPException(403, "invalid_signature")
    with pool.connection() as conn:
        row = conn.execute("SELECT file_path, content_type FROM audit_item_images WHERE id = %s",
                           (image_id,)).fetchone()
    if not row:
        raise HTTPException(404, "not_found")
    path = (UPLOAD_DIR / row["file_path"]).resolve()
    if not path.is_relative_to(UPLOAD_DIR.resolve()) or not path.exists():
        raise HTTPException(404, "not_found")
    # CORS fixo em "*": a mesma resposta (em cache) serve o <img> da tela e o canvas do PDF.
    # A URL assinada já é a credencial, então liberar a origem não abre acesso novo.
    return FileResponse(path, media_type=row["content_type"],
                        headers={"Cache-Control": "private, max-age=86400",
                                 "Access-Control-Allow-Origin": "*",
                                 "X-Content-Type-Options": "nosniff"})


@app.get("/health")
def health():
    with pool.connection() as conn:
        conn.execute("SELECT 1")
    return {"ok": True}
