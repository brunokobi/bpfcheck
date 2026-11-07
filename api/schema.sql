-- BPF Check — schema do Postgres próprio (substitui o Supabase).
-- Idempotente: pode rodar várias vezes (a API roda no startup). Requer Postgres 13+ (gen_random_uuid nativo).


CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    name          text,
    password_hash text NOT NULL,
    role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS checklists (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    is_default  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_sections (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    title        text NOT NULL,
    order_index  integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id  uuid NOT NULL REFERENCES checklist_sections(id) ON DELETE CASCADE,
    description text NOT NULL,
    order_index integer NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_locations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       text NOT NULL,
    address    text,
    city       text,
    state      text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- O id da auditoria é gerado no aparelho (crypto.randomUUID) para o modo offline.
CREATE TABLE IF NOT EXISTS audits (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checklist_id uuid NOT NULL REFERENCES checklists(id),
    location     text,
    location_id  uuid REFERENCES audit_locations(id) ON DELETE SET NULL,
    status       text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audits_user_idx ON audits (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS audit_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id          uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    checklist_item_id uuid NOT NULL REFERENCES checklist_items(id),
    result            text CHECK (result IN ('conforme', 'nao_conforme', 'nao_aplicavel')),
    observation       text,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (audit_id, checklist_item_id)
);

-- O id da imagem também vem do aparelho: reenviar a mesma foto é idempotente.
CREATE TABLE IF NOT EXISTS audit_item_images (
    id            uuid PRIMARY KEY,
    audit_item_id uuid NOT NULL REFERENCES audit_items(id) ON DELETE CASCADE,
    file_path     text NOT NULL,
    content_type  text NOT NULL DEFAULT 'image/jpeg',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_item_images_item_idx ON audit_item_images (audit_item_id);

-- Migração do Supabase no primeiro login: marca quem já teve os dados copiados.
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_imported boolean NOT NULL DEFAULT false;
