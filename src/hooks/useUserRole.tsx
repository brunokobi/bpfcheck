import { useAuth } from "./useAuth";
export type { AppRole } from "@/lib/api";

/** O papel vem junto com o usuário no login (e fica salvo para uso offline). */
export const useUserRole = () => {
  const { user } = useAuth();
  const role = user?.role ?? "user";
  return { role, isAdmin: role === "admin", loading: false };
};
