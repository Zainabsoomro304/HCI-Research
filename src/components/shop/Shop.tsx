"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CATEGORIES, type Category } from "@/config/shop";
import { DELIBERATE_EVENT_TYPES, SCROLL_THROTTLE_MS } from "@/config/study";
import { shopCssVars } from "@/config/themes";
import { toConfigId, type UIConfig } from "@/config/uiSpace";
import { products as allProducts, productsById, type Product } from "@/lib/catalog";
import type { EventSink } from "@/lib/eventLogger";
import { NullEventSink } from "@/lib/eventLogger";
import type { EventType } from "@/lib/events";
import { makeT } from "@/lib/strings";
import { ShopContext, type CartApi, type CartLine, type ShopContextValue, type ShopMode } from "./context";
import { CategorySidebar, TopBar } from "./Navigation";
import { CartDrawer, ProductDetail } from "./Overlays";
import { ProductCard } from "./ProductCard";

const DELIBERATE = new Set<string>(DELIBERATE_EVENT_TYPES);
/** Events that are not user interactions (excluded from "first interaction"). */
const PASSIVE = new Set<EventType>(["page_view", "adaptation_applied", "task_start", "task_finish", "visibility_change"]);

export interface ShopProps {
  /** Target configuration. Changing it animates the interface to the new configuration. */
  config: UIConfig;
  mode: ShopMode;
  sink?: EventSink;
  lang?: string;
  initialCategory?: Category;
  /** Restrict the products shown (clip mode). */
  productIds?: readonly string[];
  /** Right-hand panel (task mode), rendered with live cart state. */
  renderTaskPanel?: (cart: CartApi) => React.ReactNode;
  onCartChange?: (lines: CartLine[]) => void;
  /** Called for every deliberate interaction (counts toward afterEvents triggers). */
  onDeliberateEvent?: (type: EventType) => void;
  /** Called once, on the first user interaction. */
  onFirstInteraction?: (ts: number) => void;
  /** Called with the ViewTransition object whenever a config change starts animating. */
  onTransitionStart?: (vt: ViewTransition) => void;
  /** Disable the animated transition (screenshots). */
  instantTransitions?: boolean;
}

export function Shop(props: ShopProps) {
  const { config, mode, lang = "en", initialCategory = CATEGORIES[0], productIds, renderTaskPanel } = props;
  const sink = useMemo(() => props.sink ?? new NullEventSink(), [props.sink]);
  const t = useMemo(() => makeT(lang), [lang]);
  const frozen = mode === "clip";

  // Latest callbacks without re-running effects.
  const cb = useRef(props);
  cb.current = props;

  // ---- config + animated transitions ----
  const [shown, setShown] = useState<UIConfig>(config);
  const shownRef = useRef(shown);
  const targetId = toConfigId(config);
  useEffect(() => {
    sink.setContext({ configId: toConfigId(shownRef.current) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sink]);
  useEffect(() => {
    const from = toConfigId(shownRef.current);
    if (from === targetId) return;
    const next = config;
    const apply = () => {
      flushSync(() => setShown(next));
      shownRef.current = next;
    };
    if (!cb.current.instantTransitions && typeof document !== "undefined" && "startViewTransition" in document) {
      const vt = document.startViewTransition(apply);
      cb.current.onTransitionStart?.(vt);
    } else {
      apply();
    }
    sink.setContext({ configId: targetId });
    sink.log("adaptation_applied", { from, to: targetId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  // ---- logging helpers ----
  const interacted = useRef(false);
  const emit = useCallback(
    (type: EventType, payload?: Record<string, unknown>) => {
      if (frozen) return;
      sink.log(type, payload);
      if (!PASSIVE.has(type) && !interacted.current) {
        interacted.current = true;
        cb.current.onFirstInteraction?.(Date.now());
      }
      if (DELIBERATE.has(type)) cb.current.onDeliberateEvent?.(type);
    },
    [sink, frozen],
  );

  useEffect(() => {
    emit("page_view", { mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- scroll (throttled, with depth %) ----
  useEffect(() => {
    if (frozen) return;
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const report = () => {
      last = Date.now();
      pending = null;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const depth = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
      emit("scroll", { y: Math.round(window.scrollY), depthPct: depth });
    };
    const onScroll = () => {
      const since = Date.now() - last;
      if (since >= SCROLL_THROTTLE_MS) report();
      else if (!pending) pending = setTimeout(report, SCROLL_THROTTLE_MS - since);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (pending) clearTimeout(pending);
    };
  }, [emit, frozen]);

  // ---- navigation state ----
  const [category, setCategory] = useState<Category | null>(initialCategory);
  const [query, setQueryState] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectCategory = useCallback(
    (c: Category) => {
      setCategory(c);
      setQueryState("");
      window.scrollTo({ top: 0 });
      emit("category_select", { category: c });
    },
    [emit],
  );
  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        const trimmed = q.trim();
        const results = trimmed ? allProducts.filter((p) => p.name.toLowerCase().includes(trimmed.toLowerCase())).length : null;
        emit("search_query", { query: trimmed, results });
      }, 600);
    },
    [emit],
  );

  // ---- cart ----
  const [lines, setLines] = useState<CartLine[]>([]);
  const linesRef = useRef(lines);
  const commitLines = useCallback((next: CartLine[]) => {
    linesRef.current = next;
    setLines(next);
    cb.current.onCartChange?.(next);
  }, []);
  const cart: CartApi = useMemo(() => {
    const qty = (id: string) => lines.find((l) => l.productId === id)?.quantity ?? 0;
    return {
      lines,
      count: lines.reduce((a, l) => a + l.quantity, 0),
      total: lines.reduce((a, l) => a + (productsById.get(l.productId)?.price ?? 0) * l.quantity, 0),
      quantityOf: qty,
      add(productId, source) {
        const cur = linesRef.current;
        const existing = cur.find((l) => l.productId === productId);
        const next = existing
          ? cur.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
          : [...cur, { productId, quantity: 1 }];
        commitLines(next);
        emit("add_to_cart", { productId, price: productsById.get(productId)?.price, quantity: (existing?.quantity ?? 0) + 1, source });
      },
      setQuantity(productId, quantity) {
        const cur = linesRef.current;
        const from = cur.find((l) => l.productId === productId)?.quantity ?? 0;
        if (quantity <= 0) {
          commitLines(cur.filter((l) => l.productId !== productId));
          emit("remove_from_cart", { productId, quantity: from, via: "quantity" });
          return;
        }
        commitLines(cur.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
        emit("quantity_change", { productId, from, to: quantity });
      },
      remove(productId) {
        const cur = linesRef.current;
        const from = cur.find((l) => l.productId === productId)?.quantity ?? 0;
        commitLines(cur.filter((l) => l.productId !== productId));
        emit("remove_from_cart", { productId, quantity: from, via: "button" });
      },
    };
  }, [lines, emit, commitLines]);

  // ---- overlays ----
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const openProduct = useCallback(
    (p: Product) => {
      setDetail(p);
      emit("product_open", { productId: p.id });
    },
    [emit],
  );
  const detailRef = useRef<Product | null>(null);
  detailRef.current = detail;
  const closeProduct = useCallback(() => {
    if (detailRef.current) emit("product_close", { productId: detailRef.current.id });
    setDetail(null);
  }, [emit]);
  const openCart = useCallback(() => {
    setCartOpen(true);
    emit("cart_open", { items: linesRef.current.length });
  }, [emit]);
  const closeCart = useCallback(() => {
    setCartOpen(false);
    emit("cart_close", {});
  }, [emit]);

  // ---- visible products ----
  const visible = useMemo(() => {
    const pool = productIds ? productIds.map((id) => productsById.get(id)).filter((p): p is Product => !!p) : allProducts;
    const q = query.trim().toLowerCase();
    if (q) return pool.filter((p) => p.name.toLowerCase().includes(q));
    return category ? pool.filter((p) => p.category === category) : pool;
  }, [productIds, query, category]);

  const ctx: ShopContextValue = {
    config: shown,
    mode,
    t,
    emit,
    cart,
    category,
    selectCategory,
    query,
    setQuery,
    openProduct,
    openCart,
    frozen,
  };

  const q = query.trim();
  const heading = q ? t("shop.resultsFor", { query: q }) : (category ?? "");
  const countLabel = visible.length === 1 ? t("shop.itemsCountOne") : t("shop.itemsCount", { count: visible.length });
  const listingClass =
    shown.layout === "list" ? "flex flex-col gap-3" : shown.layout === "grid2" ? "grid grid-cols-2 gap-5" : "grid grid-cols-3 gap-5";

  return (
    <ShopContext.Provider value={ctx}>
      <div
        className={`shop min-h-screen bg-bg font-sans text-fg ${frozen ? "no-cursor pointer-events-none select-none" : ""}`}
        data-theme={shown.theme}
        data-layout={shown.layout}
        data-font={shown.fontSize}
        data-density={shown.density}
        data-menu={shown.menu}
        data-config-id={toConfigId(shown)}
        style={{ ...shopCssVars(shown), colorScheme: shown.theme }}
      >
        <TopBar />
        <div className="mx-auto flex max-w-[1440px] items-start gap-7 px-6 py-6">
          {shown.menu === "sidebar" && <CategorySidebar />}
          <main className="min-w-0 flex-1">
            <div
              className="mb-4 flex items-baseline justify-between gap-4"
              style={{ viewTransitionName: "shop-heading" } as React.CSSProperties}
            >
              <h1 className="text-heading font-bold tracking-tight">{heading}</h1>
              <span className="shrink-0 text-small text-muted">{countLabel}</span>
            </div>
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
                <p className="text-body text-muted">{t("shop.noResults")}</p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-4 rounded-lg border border-line px-4 py-2 text-small font-semibold hover:bg-surface-hover"
                >
                  {t("shop.clearSearch")}
                </button>
              </div>
            ) : (
              <div className={listingClass}>
                {visible.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </main>
          {renderTaskPanel && (
            <aside
              className="sticky top-[calc(var(--fs-base)*4+1.5rem)] shrink-0 self-start"
              style={{ viewTransitionName: "shop-taskpanel", width: "calc(var(--fs-base) * 18)" } as React.CSSProperties}
            >
              {renderTaskPanel(cart)}
            </aside>
          )}
        </div>
        {detail && <ProductDetail product={detail} onClose={closeProduct} />}
        {cartOpen && <CartDrawer onClose={closeCart} />}
      </div>
    </ShopContext.Provider>
  );
}

