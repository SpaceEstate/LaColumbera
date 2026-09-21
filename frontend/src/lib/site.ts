import { apiGet, apiPost, ApiError } from "@/lib/api";

export interface Periodo {
  da: string;
  a: string;
  prezzo: number;
}

export interface Apt {
  id: string;
  nome: string;
  sotto: string;
  testo: string;
  base: number;
  inclusi: number;
  extra: number;
  max: number;
  min: number;
  foto: string[];
  periodi: Periodo[];
}

export interface SiteConfig {
  chi: string;
  apts: Apt[];
}

export interface Booking {
  code: string;
  id: string;
  da: string;
  a: string;
  ospiti: number;
  nome: string;
  email: string;
  tel: string;
  totale: number;
  stato: string;
  creato?: string;
}

export interface ExtEvent {
  id: string;
  da: string;
  a: string;
  src: string;
}

export interface AdminData {
  bk: Booking[];
  ext: ExtEvent[];
}

export interface BookPayload {
  id: string;
  da: string;
  a: string;
  ospiti: number;
  nome: string;
  email: string;
  tel: string;
}

const CORTE_FOTO = [
  "/img/corte/Copia%20di%20Soggiorno%201.jpg",
  "/img/corte/Copia%20di%20Soggiorno%202.jpg",
  "/img/corte/Copia%20di%20Soggiorno%203.jpg",
  "/img/corte/Copia%20di%20Soggiorno%204.jpg",
  "/img/corte/Copia%20di%20Soggiorno%205.jpg",
  "/img/corte/Copia%20di%20Soggiorno%206.jpg",
  "/img/corte/Copia%20di%20Bagno%201.jpg",
  "/img/corte/Copia%20di%20Bagno%202.jpg",
  "/img/corte/Copia%20di%20Bagno%203.jpg",
  "/img/corte/Copia%20di%20Bagno%204.jpg",
  "/img/corte/Copia%20di%20Bagno%205.jpg",
  "/img/corte/Copia%20di%20Camera%201.jpg",
  "/img/corte/Copia%20di%20Camera%202.jpg",
  "/img/corte/Copia%20di%20Camera%203.jpg",
  "/img/corte/Copia%20di%20Camera%204.jpg",
  "/img/corte/Copia%20di%20Corridoio.jpg",
  "/img/corte/Copia%20di%20Letto%201.jpg",
  "/img/corte/Copia%20di%20Letto%202.jpg",
  "/img/corte/Copia%20di%20Letto%203.jpg",
];

const TORRE_FOTO = [
  "/img/torre/Copia%20di%20Soggiorno%201.jpg",
  "/img/torre/Copia%20di%20Soggiorno%202.jpg",
  "/img/torre/Copia%20di%20Soggiorno%203.jpg",
  "/img/torre/Copia%20di%20Soggiorno%204.jpg",
  "/img/torre/Copia%20di%20Bagno%201.jpg",
  "/img/torre/Copia%20di%20Bagno%202.jpg",
  "/img/torre/Copia%20di%20Bagno%203.jpg",
  "/img/torre/Copia%20di%20Bagno%204.jpg",
  "/img/torre/Copia%20di%20Bagno%205.jpg",
  "/img/torre/Copia%20di%20Bagno%206.jpg",
  "/img/torre/Copia%20di%20Corridoio.jpg",
  "/img/torre/Copia%20di%20Cucina%201.jpg",
  "/img/torre/Copia%20di%20Cucina%202.jpg",
  "/img/torre/Copia%20di%20Cucina%203.jpg",
  "/img/torre/Copia%20di%20Cucina%204.jpg",
  "/img/torre/Copia%20di%20Divanetto%201.jpg",
  "/img/torre/Copia%20di%20Divanetto%202.jpg",
  "/img/torre/Copia%20di%20Divanetto%203.jpg",
  "/img/torre/Copia%20di%20Doppia%201.jpg",
  "/img/torre/Copia%20di%20Matrimoniale%201.jpg",
  "/img/torre/Copia%20di%20Matrimoniale%202.jpg",
  "/img/torre/Copia%20di%20Matrimoniale%203.jpg",
  "/img/torre/Copia%20di%20Matrimoniale%204.jpg",
  "/img/torre/Copia%20di%20Terzo%20letto.jpg",
];

export const FALLBACK_CONFIG: SiteConfig = {
  chi: "La Columbera è una dimora storica del XV secolo nel borgo di Ravina, alle porte di Trento.",
  apts: [
    {
      id: "torre",
      nome: "La Columbera Torre",
      sotto: "Su due livelli · fino a 5 ospiti",
      testo:
        "Sviluppato su due piani nella dimora quattrocentesca, l'appartamento Torre è la scelta ideale per famiglie e piccoli gruppi che vogliono vivere la dimora in autonomia.\n\nAmpio soggiorno con travi a vista, cucina attrezzata, camere confortevoli distribuite su due livelli e bagni completi. Biancheria, WiFi e check-in autonomo inclusi.\n\nIl borgo di Ravina è a due passi, il centro di Trento a pochi minuti: la base perfetta per scoprire il territorio trentino.",
      base: 180,
      inclusi: 2,
      extra: 20,
      max: 5,
      min: 2,
      foto: TORRE_FOTO,
      periodi: [],
    },
    {
      id: "corte",
      nome: "La Columbera Corte",
      sotto: "Piano terra · fino a 4 ospiti",
      testo:
        "Al piano terra della dimora, con accesso indipendente, l'appartamento Corte accoglie coppie, famiglie e piccoli gruppi di amici in ambienti curati.\n\nSoggiorno accogliente, cucina attrezzata, camere rifinite e bagno privato. Biancheria, WiFi e check-in autonomo inclusi, per sentirsi subito a casa.\n\nFuori, il borgo di Ravina con i suoi scorci storici; il centro di Trento è a pochi minuti.",
      base: 120,
      inclusi: 2,
      extra: 20,
      max: 4,
      min: 2,
      foto: CORTE_FOTO,
      periodi: [],
    },
  ],
};

export const eur = (n: number) => `€${Math.round(n)}`;

export const listDays = (da: string, a: string): string[] => {
  const out: string[] = [];
  const d = new Date(da + "T00:00:00Z");
  const end = new Date(a + "T00:00:00Z");
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

export const nightPrice = (apt: Apt, day: string): number => {
  const p = (apt.periodi || []).find((q) => day >= q.da && day <= q.a);
  return p ? p.prezzo : apt.base;
};

export const totalPrice = (apt: Apt, da: string, a: string, ospiti: number): number =>
  listDays(da, a).reduce(
    (s, d) => s + nightPrice(apt, d) + Math.max(0, ospiti - apt.inclusi) * apt.extra,
    0,
  );

export const fmtDate = (iso: string): string =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const aptShortName = (apt: Apt): string => apt.nome.replace("La Columbera ", "");

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { err?: unknown; detail?: unknown } | null;
    if (b?.err && typeof b.err === "string") return b.err;
    if (typeof b?.detail === "string") return b.detail;
    if (Array.isArray(b?.detail))
      return b.detail
        .map((x) => (x && typeof x.msg === "string" ? x.msg : ""))
        .filter(Boolean)
        .join(" ");
    return `Errore ${e.status}`;
  }
  return e instanceof Error ? e.message : "Errore imprevisto";
}

export const getConfig = () => apiGet<SiteConfig>("/config");
export const getBusy = (id: string) => apiGet<string[]>(`/busy?id=${encodeURIComponent(id)}`);
export const bookStay = (b: BookPayload) => apiPost<Booking>("/book", b);
export const myBookings = (email: string, code: string) =>
  apiPost<Booking[]>("/mie", { email, code });
export const adminLogin = (u: string, p: string) =>
  apiPost<{ t: string }>("/admin/login", { u, p });

async function authFetch<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiError(res.status, j);
  }
  return (await res.json()) as T;
}

export const getAdminData = (t: string) => authFetch<AdminData>("GET", "/admin/data", t);
export const adminSetStatus = (t: string, code: string, stato: string) =>
  authFetch<{ ok: number }>("POST", "/admin/status", t, { code, stato });
export const adminUpload = (t: string, id: string, img: string) =>
  authFetch<{ url: string }>("POST", "/admin/upload", t, { id, img });
export const adminSave = (t: string, cfg: SiteConfig) =>
  authFetch<{ ok: number }>("POST", "/admin/save", t, cfg);
