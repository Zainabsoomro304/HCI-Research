"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/config/shop";
import { imageUrl, type Product } from "@/lib/catalog";
import { CATEGORY_TILE } from "@/lib/productArt";
import { useShop } from "./context";
import { CheckIcon, PlusIcon } from "./icons";

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
    <span className="inline-flex items-center gap-1.5 text-small text-muted" aria-label={t("shop.rating", { rating: rating.toFixed(1) })}>
      <span className="relative inline-flex leading-none" aria-hidden>
        <StarRow className="text-star-empty" />
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <StarRow className="text-star" />
        </span>
      </span>
      <span className="tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}

export function AddToCartButton({ product, source, full }: { product: Product; source: "card" | "detail"; full?: boolean }) {
  const { t, cart, frozen } = useShop();
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <button
      type="button"
      tabIndex={frozen ? -1 : 0}
      onClick={() => {
        cart.add(product.id, source);
        setJustAdded(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setJustAdded(false), 1200);
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-body font-semibold text-on-accent transition-colors hover:bg-accent-hover ${full ? "w-full" : ""}`}
    >
      {justAdded ? <CheckIcon width="1.1em" height="1.1em" /> : <PlusIcon width="1.1em" height="1.1em" />}
      <span>{justAdded ? t("shop.added") : t("shop.addToCart")}</span>
    </button>
  );
}

function ProductName({ product, className }: { product: Product; className: string }) {
  const { openProduct, frozen } = useShop();
  return (
    <button
      type="button"
      tabIndex={frozen ? -1 : 0}
      onClick={() => openProduct(product)}
      className={`text-left font-semibold leading-snug text-fg decoration-2 underline-offset-2 hover:underline ${className}`}
    >
      {product.name}
    </button>
  );
}

function ProductImage({ product, className }: { product: Product; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={imageUrl(product)}
      alt=""
      draggable={false}
      className={`block select-none object-contain ${className}`}
      style={{ backgroundColor: CATEGORY_TILE[product.category] }}
    />
  );
}

/** Price that only appears on hover/focus (summary density). Space is reserved so nothing shifts. */
function HoverPrice({ product, className }: { product: Product; className: string }) {
  return (
    <span
      className={`pointer-events-none font-semibold tabular-nums opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${className}`}
    >
      {formatPrice(product.price)}
    </span>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { config } = useShop();
  const { layout, density } = config;
  const vtName = { viewTransitionName: `p-${product.id}` } as React.CSSProperties;
  // Price + button morph as their own element in every layout, so the card box never clips them mid-transition.
  const vtAction = { viewTransitionName: `act-${product.id}`, viewTransitionClass: "act" } as React.CSSProperties;

  if (layout === "list") {
    return (
      <article
        style={vtName}
        data-product-id={product.id}
        className="group flex items-center gap-5 rounded-xl border border-line bg-surface p-3 pr-5 shadow-card"
      >
        <ProductImage product={product} className="aspect-[4/3] w-32 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ProductName product={product} className="text-title" />
          {density === "detailed" && (
            <>
              <Stars rating={product.rating} />
              <p className="line-clamp-2 max-w-[60ch] text-small text-muted">{product.description}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-5" style={vtAction}>
          {density === "summary" ? (
            <HoverPrice product={product} className="min-w-[4ch] text-right text-title" />
          ) : (
            <span className="min-w-[4ch] text-right text-title font-semibold tabular-nums">{formatPrice(product.price)}</span>
          )}
          <AddToCartButton product={product} source="card" />
        </div>
      </article>
    );
  }

  return (
    <article
      style={vtName}
      data-product-id={product.id}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="relative">
        <ProductImage product={product} className={`w-full ${layout === "grid2" ? "h-[220px]" : "h-[180px]"}`} />
        {density === "summary" && (
          <HoverPrice
            product={product}
            className="absolute bottom-3 left-3 rounded-full bg-surface px-3 py-1 text-small text-fg shadow-card"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <ProductName product={product} className="text-title" />
        {density === "detailed" && (
          <>
            <Stars rating={product.rating} />
            <p className="line-clamp-2 text-small text-muted">{product.description}</p>
          </>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2" style={vtAction}>
          {density !== "summary" && <span className="text-title font-semibold tabular-nums">{formatPrice(product.price)}</span>}
          <AddToCartButton product={product} source="card" />
        </div>
      </div>
    </article>
  );
}
