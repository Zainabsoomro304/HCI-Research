"use client";

import { useEffect, useRef } from "react";
import { formatPrice } from "@/config/shop";
import { imageUrl, productDescription, productName, productUnit, productsById, type Product } from "@/lib/catalog";
import { CATEGORY_TILE } from "@/lib/productArt";
import type { StringKey } from "@/lib/strings";
import { ActionButton, QuantityStepper } from "./ActionButton";
import { useShop } from "./context";
import { CloseIcon, TrashIcon } from "./icons";
import { BuyControl, Price, Stars } from "./ProductCard";

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
  const { t, lang, cart } = useShop();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useDialogFocus(ref);
  const inBasket = cart.quantityOf(product.id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-[1.2em] [animation:fade-in_150ms_ease-out]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("shop.details")}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-[46em] gap-[1.4em] rounded-[1em] border-[length:var(--bw)] border-line bg-surface p-[1.2em] text-fg [animation:pop-in_180ms_ease-out]"
        style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}
      >
        <div className="absolute end-[0.6em] top-[0.6em]">
          <ActionButton tone="secondary" icon={<CloseIcon />} label={t("shop.close")} onClick={onClose} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(product)} alt="" className="aspect-[4/3] w-[42%] shrink-0 self-start rounded-[0.8em] object-contain" style={{ backgroundColor: CATEGORY_TILE[product.category] }} />
        <div className="flex min-w-0 flex-1 flex-col gap-[0.5em] pe-[2.5em]">
          <span className="text-caption font-semibold text-muted">{t(`cat.${product.category}` as StringKey)}</span>
          <h2 className="text-heading font-bold leading-tight">{productName(product, lang)}</h2>
          <span className="text-body text-muted">{productUnit(product, lang)}</span>
          <Stars rating={product.rating} />
          <p className="text-body text-muted">{productDescription(product, lang)}</p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-[1em] pt-[0.8em]">
            <Price amount={product.price} className="text-heading" />
            <BuyControl product={product} source="detail" />
          </div>
          {inBasket > 0 && <span className="text-small text-muted">{t("shop.inBasket", { count: inBasket })}</span>}
        </div>
      </div>
    </div>
  );
}

export function CartDrawer({ onClose }: { onClose: () => void }) {
  const { t, lang, cart } = useShop();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useDialogFocus(ref);
  return (
    <div className="fixed inset-0 z-50 bg-overlay [animation:fade-in_150ms_ease-out]" onMouseDown={onClose}>
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("shop.basketTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-y-0 end-0 flex flex-col border-s-[length:var(--bw)] border-line bg-surface text-fg [animation:slide-in-end_200ms_ease-out]"
        style={{ width: "min(calc(var(--fs-base) * 30), 94vw)", boxShadow: "0 0 40px rgba(0,0,0,0.2)" }}
      >
        <div className="flex items-center justify-between border-b-[length:var(--bw)] border-line px-[1em] py-[0.7em]">
          <h2 className="text-title font-bold">{t("shop.basketTitle")}</h2>
          <ActionButton tone="secondary" icon={<CloseIcon />} label={t("shop.close")} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-[1em] py-[0.5em]">
          {cart.lines.length === 0 ? (
            <p className="py-[2em] text-center text-body text-muted">{t("shop.basketEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {cart.lines.map((line) => {
                const p = productsById.get(line.productId);
                if (!p) return null;
                const name = productName(p, lang);
                return (
                  <li key={p.id} className="flex flex-col gap-[0.5em] py-[0.8em]">
                    <div className="flex items-start gap-[0.7em]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl(p)} alt="" className="aspect-[4/3] w-[3.6em] shrink-0 rounded-[0.4em] object-contain" style={{ backgroundColor: CATEGORY_TILE[p.category] }} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body font-semibold leading-snug">{name}</span>
                        <span className="text-small text-muted">
                          {productUnit(p, lang)} · <bdi>{t("shop.each", { price: formatPrice(p.price, lang) })}</bdi>
                        </span>
                      </div>
                      <Price amount={p.price * line.quantity} className="text-body" />
                    </div>
                    <div className="flex items-center justify-between gap-[0.6em]">
                      <QuantityStepper name={name} quantity={line.quantity} onChange={(q) => cart.setQuantity(p.id, q)} />
                      <ActionButton tone="secondary" icon={<TrashIcon />} label={t("shop.remove")} ariaLabel={t("shop.removeItem", { name })} onClick={() => cart.remove(p.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-[0.7em] border-t-[length:var(--bw)] border-line px-[1em] py-[0.8em]">
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold">{t("shop.basketTotal")}</span>
            <Price amount={cart.total} className="text-title" />
          </div>
          <ActionButton label={t("shop.continueShopping")} onClick={onClose} alwaysLabel wide className="text-body" />
        </div>
      </aside>
    </div>
  );
}
