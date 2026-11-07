import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Cloud, CloudOff, CloudUpload, LogOut, Mail, RefreshCw, Shield, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppUser } from "@/lib/api";
import { db } from "@/lib/localdb";
import { flush, retryFailed } from "@/lib/sync";
import { useSyncStatus } from "@/hooks/useSyncStatus";

interface ProfilePageProps {
  user: AppUser;
  onLogout: () => void;
}

const Row = ({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) => (
  <div className="flex items-center gap-3 py-3">
    <div className="w-10 h-10 shrink-0 rounded-[13px] bg-sky-50 text-sky-700 flex items-center justify-center">
      <Icon className="w-5 h-5" aria-hidden="true" />
    </div>
    <div className="min-w-0 flex flex-col">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className="text-[15px] font-bold text-slate-900 truncate">{value}</span>
    </div>
  </div>
);

/** Perfil: dados da conta e estado real da sincronização deste aparelho. */
export const ProfilePage = ({ user, onLogout }: ProfilePageProps) => {
  const { online, pending, failed, syncing, lastSyncAt, lastError } = useSyncStatus();
  const localAudits = useLiveQuery(() => db.audits.count(), [], 0);
  const localPhotos = useLiveQuery(() => db.photos.filter(p => !!p.blob).count(), [], 0);

  const handleLogout = () => {
    if (pending > 0 && !window.confirm(
      `Há ${pending} alteração(ões) ainda não enviadas. Elas continuam guardadas neste aparelho e serão enviadas quando você entrar de novo com esta conta. Sair mesmo assim?`,
    )) return;
    onLogout();
  };

  const SyncIcon = !online ? CloudOff : pending > 0 ? CloudUpload : Cloud;

  return (
    <div className="flex flex-col gap-4">
      <div className="bpf-rise flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em] text-slate-900">Perfil</h1>
        <p className="m-0 text-sm text-slate-600">Sua conta e a sincronização deste aparelho</p>
      </div>

      <section className="bpf-pop bg-white rounded-3xl px-5 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-4 pb-3 border-b border-slate-100">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-[#0369A1] text-white flex items-center justify-center text-xl font-extrabold" aria-hidden="true">
            {(user.name || user.email).trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex flex-col">
            <span className="text-lg font-extrabold text-slate-900 truncate">{user.name || user.email.split("@")[0]}</span>
            <span className="text-sm text-slate-600">{user.role === "admin" ? "Administrador" : "Auditor(a)"}</span>
          </div>
        </div>
        <Row icon={Mail} label="E-mail" value={user.email} />
        {user.role === "admin" && <Row icon={Shield} label="Permissão" value="Vê as auditorias de todos os usuários" />}
      </section>

      <section className="bpf-pop bg-white rounded-3xl px-5 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <SyncIcon className={`w-6 h-6 ${online ? "text-sky-700" : "text-amber-600"}`} aria-hidden="true" />
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="text-[15px] font-extrabold text-slate-900">
              {!online ? "Sem conexão" : syncing ? "Sincronizando…" : pending > 0 ? "Aguardando envio" : "Tudo sincronizado"}
            </span>
            <span className="text-xs text-slate-600">
              {lastSyncAt
                ? `Último envio: ${format(new Date(lastSyncAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`
                : "Nenhum envio nesta sessão"}
            </span>
          </div>
          <button
            type="button" onClick={() => void flush()} disabled={!online || syncing}
            aria-label="Sincronizar agora"
            className="w-11 h-11 shrink-0 rounded-[14px] bg-sky-50 text-sky-700 flex items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <Row icon={CloudUpload} label="Alterações a enviar" value={String(pending)} />
        <Row icon={Smartphone} label="Auditorias neste aparelho" value={String(localAudits)} />
        <Row icon={CloudUpload} label="Fotos aguardando envio" value={String(localPhotos)} />
        {failed > 0 && (
          <div className="mt-1 p-3 rounded-2xl bg-red-50 text-red-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0 text-sm">
              <p className="m-0 font-bold">{failed} alteração(ões) recusada(s) pelo servidor</p>
              {lastError && <p className="m-0 text-xs break-words opacity-80">{lastError}</p>}
            </div>
            <button type="button" onClick={() => void retryFailed()} className="shrink-0 min-h-11 px-3 rounded-xl bg-red-100 font-bold text-sm">
              Tentar de novo
            </button>
          </div>
        )}
      </section>

      <button
        type="button" onClick={handleLogout}
        className="bpf-tap h-14 rounded-2xl bg-white text-red-700 font-bold flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
      >
        <LogOut className="w-5 h-5" aria-hidden="true" /> Sair da conta
      </button>
    </div>
  );
};
