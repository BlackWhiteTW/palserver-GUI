import type { InstanceStatus } from "@palserver/shared";
import { STATUS_LABELS } from "./labels";
import { t, useI18n } from "./i18n";

export const btn =
  "rounded-full bg-pal px-5 py-2 text-sm font-extrabold text-white transition " +
  "hover:-translate-y-px hover:bg-pal-strong active:translate-y-0 active:scale-95 " +
  "disabled:pointer-events-none disabled:opacity-50";
export const btnGhost =
  "rounded-full border-2 border-line bg-card-soft px-5 py-2 text-sm font-extrabold text-ink " +
  "transition hover:-translate-y-px hover:border-pal active:translate-y-0 active:scale-95 " +
  "disabled:pointer-events-none disabled:opacity-50";
export const btnDanger = btnGhost + " text-berry hover:border-berry";
export const card = "rounded-(--radius-cute) border-2 border-line bg-card p-5 shadow-(--shadow-cute)";
export const inputCls =
  "rounded-xl border-2 border-line bg-card-soft px-3 py-2 text-sm text-ink outline-none " +
  "transition focus:border-pal";
export const labelCls = "flex flex-col gap-1.5 text-left text-[13px] font-bold text-ink-muted";
export const errorCls = "rounded-xl bg-berry/10 px-3 py-2 text-[13px] font-bold text-berry";

const STATUS_CLS: Record<InstanceStatus, string> = {
  running: "border-grass/40 bg-grass/15 text-grass",
  installing: "border-sun/40 bg-sun/15 text-sun",
  restarting: "border-sun/40 bg-sun/15 text-sun",
  starting: "border-pal/40 bg-pal/15 text-pal",
  exited: "border-berry/35 bg-berry/10 text-berry",
  missing: "border-berry/35 bg-berry/10 text-berry",
  created: "border-line bg-card-soft text-ink-muted",
};

export function StatusBadge({ status }: { status: InstanceStatus }) {
  useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-xs font-bold ${STATUS_CLS[status]}`}
    >
      <span className="size-2 rounded-full bg-current" />
      {t(STATUS_LABELS[status])}
    </span>
  );
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-[rgb(35_32_48/0.55)] p-6 backdrop-blur-[3px]"
      onClick={onClose}
    >
      {children}
    </div>
  );
}
