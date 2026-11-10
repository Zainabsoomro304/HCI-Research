"use client";

import { formatPrice } from "@/config/shop";
import { imageUrl, productDescription, productName, productUnit, type Product } from "@/lib/catalog";
import { CATEGORY_TILE } from "@/lib/productArt";
import { ActionButton, QuantityStepper } from "./ActionButton";
import { useShop } from "./context";
import { PlusIcon } from "./icons";

const STAR_PATH = "M10 1.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z";

function StarRow({ className }: { className: string }) {
  return (
    <svg className={`block shrink-0 ${className}`} width="5.6em" height="1em" viewBox="0 0 112 20" fill="currentColor">
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={STAR_PATH} transform={`translate(${i * 23} 0)`} />
      ))}
    </svg>
  );
}

export function Stars({ rating }: { rating: number }) {
  const { t } = useShop();
  const pct = (rating / 5) * 100;
  return (
    <span className="inline-flex items-center gap-[0.4em] text-small text-muted" aria-label={t("shop.rating", { rating: rating.toFixed(1) })}>
      {/* Stars fill from the left in both directions, like a gauge. */}
      <span className="relative inline-flex leading-none" aria-hidden dir="ltr">
        <StarRow className="text-star-empty" />
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <StarRow className="text-star" />
        </span>
      </span>
      <bdi dir="ltr" className="tabular-nums">
        {rating.toFixed(1)}
      </bdi>
    </span>
  );
}

export function Price({ amount, className = "" }: { amount: number; className?: string }) {
  const { lang } = useShop();
  return <bdi className={`font-bold tabular-nums ${className}`}>{formatPrice(amount, lang)}</bdi>;
}

/** "Add" until the product is in the basket, then a −/+ quantity control. */
export function BuyControl({ product, source }: { product: Product; source: "card" | "detail" }) {
  const { t, lang, cart } = useShop();
  const qty = cart.quantityOf(product.id);
  const name = productName(product, lang);
  if (qty > 0) return <QuantityStepper name={name} quantity={qty} onChange={(q) => cart.setQuantity(product.id, q)} />;
  return <ActionButton icon={<PlusIcon />} label={t("shop.add")} ariaLabel={t("shop.addItem", { name })} onClick={() => cart.add(product.id, source)} className="text-body" />;
}

function ProductName({ product, className }: { product: Product; className: string }) {
  const { lang, openProduct, frozen } = useShop();
  return (
    <button
      type="button"
      tabIndex={frozen ? -1 : 0}
      onClick={() => openProduct(product)}
      className={`text-start font-semibold leading-[1.3] text-fg decoration-2 underline-offset-[0.2em] hover:underline ${className}`}
    >
      {productName(product, lang)}
    </button>
  );
}

function ProductImage({ product, className }: { product: Product; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl(product)} alt="" draggable={false} className={`block select-none object-contain ${className}`} style={{ backgroundColor: CATEGORY_TILE[product.category] }} />;
}

export function ProductCard({ product }: { product: Product }) {
  const { config, lang } = useShop();
  const vtCard = { viewTransitionName: `p-${product.id}` } as React.CSSProperties;
  // The price and buy control morph as their own element, so the card box never clips them mid-transition.
  const vtAction = { viewTransitionName: `act-${product.id}`, viewTransitionClass: "act" } as React.CSSProperties;
  const unit = <span className="text-small text-muted">{productUnit(product, lang)}</span>;

  if (config.layout === "list") {
    return (
      <article style={vtCard} data-product-id={product.id} className="flex items-center gap-[1em] rounded-[0.8em] border-[length:var(--bw)] border-line bg-surface p-[0.6em] pe-[1em] shadow-card">
        <ProductImage product={product} className="aspect-[4/3] w-[8.5em] shrink-0 rounded-[0.55em]" />
        <div className="flex min-w-0 flex-1 flex-col gap-[0.15em]">
          <ProductName product={product} className="text-title" />
          {unit}
          <p className="line-clamp-1 text-small text-muted">{productDescription(product, lang)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-[1em]" style={vtAction}>
          <Price amount={product.price} className="min-w-[5.5ch] text-end text-title" />
          <BuyControl product={product} source="card" />
        </div>
      </article>
    );
  }

  return (
    <article style={vtCard} data-product-id={product.id} className="flex flex-col overflow-hidden rounded-[0.8em] border-[length:var(--bw)] border-line bg-surface shadow-card">
      <ProductImage product={product} className="h-[7.5em] w-full" />
      <div className="flex flex-1 flex-col gap-[0.2em] p-[0.8em]">
        <ProductName product={product} className="text-title" />
        {unit}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-[0.8em] gap-y-[0.5em] pt-[0.5em]" style={vtAction}>
          <Price amount={product.price} className="text-title" />
          <BuyControl product={product} source="card" />
        </div>
      </div>
    </article>
  );
}
