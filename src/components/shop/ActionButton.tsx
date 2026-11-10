"use client";

import { forwardRef, type ReactNode } from "react";
import { formatNumber } from "@/config/shop";
import { useShop } from "./context";
import { MinusIcon, PlusIcon } from "./icons";

/**
 * Every action button in the shop goes through this component, so the experimental settings apply consistently:
 *   buttonStyle  flat (text in colour) / outlined (border) / raised (filled, shadow, pressed state)
 *   targetSize   min height and width var(--tap) (36 or 52 px)
 *   iconLabels   icon only (accessible name and hover tooltip, no visible text) / icon with a short visible label
 */
export type ActionTone = "primary" | "secondary";

const STYLE: Record<string, Record<ActionTone, string>> = {
  flat: {
    primary: "act-flat text-accent hover:bg-surface-hover",
    secondary: "act-flat text-fg hover:bg-surface-hover",
  },
  outlined: {
    primary: "border-[length:var(--bw)] border-accent bg-surface text-accent hover:bg-accent-soft",
    secondary: "border-[length:var(--bw)] border-control bg-surface text-fg hover:bg-surface-hover",
  },
  raised: {
    primary: "act-raised bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed",
    secondary: "act-raised bg-accent-soft text-on-accent-soft hover:brightness-95",
  },
};

export interface ActionButtonProps {
  icon?: ReactNode;
  /** Visible with iconText (or when there is no icon); otherwise only the accessible name and tooltip. */
  label: string;
  /** Full accessible name, when it should say more than the label (e.g. "Add Bananas to basket"). */
  ariaLabel?: string;
  tone?: ActionTone;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  /** Always show the label, whatever the iconLabels setting (e.g. "Finish task", which has no icon). */
  alwaysLabel?: boolean;
  /** Stretch to the full width of the parent. */
  wide?: boolean;
  pressed?: boolean;
  current?: boolean;
  style?: React.CSSProperties;
  /** Data shown after the label in every iconLabels setting (e.g. the basket total). It is content, not a label. */
  trailing?: ReactNode;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { icon, label, ariaLabel, tone = "primary", onClick, className = "", disabled, alwaysLabel, wide, pressed, current, style, trailing },
  ref,
) {
  const { config, frozen } = useShop();
  const showLabel = alwaysLabel || !icon || config.iconLabels === "iconText";
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={frozen ? -1 : 0}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (showLabel ? undefined : label)}
      aria-pressed={pressed}
      aria-current={current ? "page" : undefined}
      data-tip={showLabel ? undefined : label}
      style={style}
      className={`act inline-flex shrink-0 items-center justify-center gap-[0.4em] whitespace-nowrap rounded-[0.55em] font-semibold leading-none transition-[background-color,box-shadow,transform] disabled:opacity-50 ${
        showLabel || trailing ? "px-[0.85em]" : "px-[0.5em]"
      } ${wide ? "w-full" : ""} ${STYLE[config.buttonStyle]![tone]} ${className}`}
    >
      {icon && <span className="grid place-items-center">{icon}</span>}
      {showLabel && <span className="act-label">{label}</span>}
      {trailing}
    </button>
  );
});

/** The −  n  + control used once a product is in the basket. */
export function QuantityStepper({ name, quantity, onChange, size = "body" }: { name: string; quantity: number; onChange: (q: number) => void; size?: "body" | "small" }) {
  const { t, lang } = useShop();
  return (
    <div className={`inline-flex items-center gap-[var(--tap-gap)] ${size === "small" ? "text-small" : "text-body"}`} role="group" aria-label={t("shop.quantity")}>
      <ActionButton tone="secondary" icon={<MinusIcon />} label={t("shop.less")} ariaLabel={t("shop.decrease", { name })} onClick={() => onChange(quantity - 1)} />
      <span className="min-w-[2ch] text-center font-bold tabular-nums" aria-live="polite">
        <bdi dir="ltr">{formatNumber(quantity, lang)}</bdi>
      </span>
      <ActionButton tone="secondary" icon={<PlusIcon />} label={t("shop.more")} ariaLabel={t("shop.increase", { name })} onClick={() => onChange(quantity + 1)} />
    </div>
  );
}
