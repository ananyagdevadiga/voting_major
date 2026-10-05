/* eslint-disable react-refresh/only-export-components */
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle } from "lucide-react";

const buttonVariants = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

export function buttonClass(variant = "primary", block = false) {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
    buttonVariants[variant]
  } ${block ? "w-full" : ""}`;
}

export function Button({ variant = "primary", block = false, busy = false, className = "", children, ...props }) {
  return (
    <button type="button" className={`${buttonClass(variant, block)} ${className}`} {...props}>
      {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ className = "", children }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

// Thin progress bar shown above each step of the register and vote flows.
export function StepProgress({ step, total, label }) {
  return (
    <div className="mb-5 px-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-400">
          Step {step} of {total}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-500"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

const tones = {
  info: { box: "bg-indigo-50 text-indigo-900", icon: "text-indigo-500", Icon: Info },
  error: { box: "bg-rose-50 text-rose-900", icon: "text-rose-500", Icon: AlertCircle },
  warning: { box: "bg-amber-50 text-amber-900", icon: "text-amber-500", Icon: AlertTriangle },
  success: { box: "bg-emerald-50 text-emerald-900", icon: "text-emerald-500", Icon: CheckCircle2 },
};

export function Notice({ tone = "info", title, children, className = "" }) {
  const { box, icon, Icon } = tones[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl p-4 text-sm ${box} ${className}`}>
      <Icon size={18} className={`mt-px shrink-0 ${icon}`} aria-hidden="true" />
      <div className="leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}

const badgeTones = {
  info: "bg-indigo-50 text-indigo-600",
  error: "bg-rose-50 text-rose-600",
  warning: "bg-amber-50 text-amber-600",
  success: "bg-emerald-50 text-emerald-600",
};

export function IconBadge({ tone = "info", icon }) {
  const Icon = icon;
  return (
    <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${badgeTones[tone]}`}>
      <Icon size={24} aria-hidden="true" />
    </span>
  );
}

export const inputClass =
  "block h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15";

export function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
      <LoaderCircle size={24} className="animate-spin text-indigo-600" aria-hidden="true" />
      {label}
    </div>
  );
}

// Candidate rows with proportional bars, shared by the results and success pages.
export function ResultsList({ candidates, total: rawTotal }) {
  const total = Number(rawTotal) || 0;
  const max = Math.max(0, ...candidates.map((c) => Number(c.votes)));

  return (
    <div>
      <ul className="space-y-5">
        {candidates.map((c) => {
          const votes = Number(c.votes);
          const share = total > 0 ? (votes / total) * 100 : 0;
          const leading = votes > 0 && votes === max;

          return (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {c.name}
                    {leading && (
                      <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Leading
                      </span>
                    )}
                  </p>
                  {c.party && <p className="text-sm text-slate-500">{c.party}</p>}
                </div>
                <p className="shrink-0 text-sm tabular-nums text-slate-500">
                  <span className="font-semibold text-slate-900">{votes.toLocaleString()}</span> · {share.toFixed(1)}%
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${leading ? "bg-indigo-600" : "bg-indigo-300"}`}
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Total votes</span>
        <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// Centered outcome card used for success, error and dead-end pages.
export function StatusCard({ tone, icon, title, children, actions }) {
  return (
    <Card className="text-center">
      <IconBadge tone={tone} icon={icon} />
      <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-500">{children}</div>
      {actions && <div className="mt-8 flex flex-col gap-3">{actions}</div>}
    </Card>
  );
}
