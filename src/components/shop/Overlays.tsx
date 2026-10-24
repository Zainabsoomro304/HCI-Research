"use client";

import { useEffect, useRef } from "react";
import { formatPrice } from "@/config/shop";
import { imageUrl, productsById, type Product } from "@/lib/catalog";
import { useShop } from "./context";
import { AddToCartButton, Stars } from "./ProductCard";
import { CloseIcon, MinusIcon, PlusIcon } from "./icons";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Focus the first focusable element in the dialog on open and restore focus on close. */
function useDialogFocus(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
    return () => prev?.focus?.();
  }, [ref]);
}

export function ProductDetail({ product, onClose }: { product: Product; onClose: () => void }) {
  const { t, cart } = useShop();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useDialogFocus(ref);
  const inCart = cart.quantityOf(product.id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-6 [animation:fade-in_150ms_ease-out]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("shop.details")}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-[52em] gap-7 rounded-2xl border border-line bg-surface p-6 text-fg [animation:pop-in_180ms_ease-out]"
        style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("shop.close")}
          className="absolute right-3 top-3 grid place-items-center rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-fg"
        >
          <CloseIcon />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(product)} alt="" className="aspect-[4/3] w-[45%] shrink-0 self-start rounded-xl object-cover" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 pr-6">
          <span className="text-caption font-semibold uppercase tracking-wider text-muted">{product.category}</span>
          <h2 className="text-heading font-bold leading-tight">{product.name}</h2>
          <Stars rating={product.rating} />
          <p className="text-body text-muted">{product.description}</p>
          <div className="mt-auto flex items-center justify-between gap-4 pt-4">
            <span className="text-heading font-bold tabular-nums">{formatPrice(product.price)}</span>
            <AddToCartButton product={product} source="detail" />
          </div>
          {inCart > 0 && <span className="text-small text-muted">{t("shop.inCart", { count: inCart })}</span>}
        </div>
      </div>
    </div>
  );
}

export function CartDrawer({ onClose }: { onClose: () => void }) {
  const { t, cart } = useShop();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useDialogFocus(ref);
  return (
    <div className="fixed inset-0 z-50 bg-overlay [animation:fade-in_150ms_ease-out]" onMouseDown={onClose}>
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("shop.cartTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex flex-col border-l border-line bg-surface text-fg [animation:slide-in-right_200ms_ease-out]"
        style={{ width: "min(calc(var(--fs-base) * 26), 92vw)", boxShadow: "-12px 0 40px rgba(0,0,0,0.2)" }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-title font-bold">{t("shop.cartTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("shop.close")} className="rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-fg">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.lines.length === 0 ? (
            <p className="py-10 text-center text-body text-muted">{t("shop.cartEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {cart.lines.map((line) => {
                const p = productsById.get(line.productId);
                if (!p) return null;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl(p)} alt="" className="aspect-[4/3] w-16 shrink-0 rounded-md object-cover" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-small font-semibold leading-snug">{p.name}</span>
                        <span className="text-small font-semibold tabular-nums">{formatPrice(p.price * line.quantity)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-lg border border-line" role="group" aria-label={t("shop.quantity")}>
                          <button
                            type="button"
                            aria-label={t("shop.decrease", { name: p.name })}
                            onClick={() => cart.setQuantity(p.id, line.quantity - 1)}
                            className="grid place-items-center rounded-l-lg px-2 py-1 hover:bg-surface-hover"
                          >
                            <MinusIcon width="1em" height="1em" />
                          </button>
                          <span className="min-w-[2ch] text-center text-small font-semibold tabular-nums">{line.quantity}</span>
                          <button
                            type="button"
                            aria-label={t("shop.increase", { name: p.name })}
                            onClick={() => cart.setQuantity(p.id, line.quantity + 1)}
                            className="grid place-items-center rounded-r-lg px-2 py-1 hover:bg-surface-hover"
                          >
                            <PlusIcon width="1em" height="1em" />
                          </button>
                        </div>
                        <span className="text-caption text-muted tabular-nums">{t("shop.each", { price: formatPrice(p.price) })}</span>
                        <button
                          type="button"
                          aria-label={t("shop.removeItem", { name: p.name })}
                          onClick={() => cart.remove(p.id)}
                          className="rounded-md px-2 py-1 text-caption font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
                        >
                          {t("shop.remove")}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold">{t("shop.cartTotal")}</span>
            <span className="text-title font-bold tabular-nums">{formatPrice(cart.total)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2.5 text-body font-semibold text-on-accent hover:bg-accent-hover"
          >
            {t("shop.continueShopping")}
          </button>
        </div>
      </aside>
    </div>
  );
}
