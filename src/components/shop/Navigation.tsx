"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, SHOP_NAME, formatPrice, type Category } from "@/config/shop";
import { products } from "@/lib/catalog";
import { useShop } from "./context";
import { BagIcon, CartIcon, CheckIcon, ChevronDown, CloseIcon, SearchIcon } from "./icons";

const COUNTS = new Map(CATEGORIES.map((c) => [c, products.filter((p) => p.category === c).length]));

export function TopBar() {
  const { config, t, cart, openCart, frozen } = useShop();
  return (
    <header
      style={{ viewTransitionName: "shop-topbar" } as React.CSSProperties}
      className="sticky top-0 z-30 border-b border-line bg-surface-2"
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-5 px-6" style={{ height: "calc(var(--fs-base) * 4)" }}>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-on-accent" style={{ width: "2.1em", height: "2.1em" }}>
            <BagIcon />
          </span>
          <span className="text-brand font-bold tracking-tight text-fg">{SHOP_NAME}</span>
        </div>
        {config.menu === "dropdown" && <CategoryDropdown />}
        <SearchBox />
        <button
          type="button"
          tabIndex={frozen ? -1 : 0}
          onClick={openCart}
          aria-label={t("shop.cartButton", { count: cart.count, total: formatPrice(cart.total) })}
          className="ml-auto flex shrink-0 items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-fg transition-colors hover:bg-surface-hover"
        >
          <span className="relative">
            <CartIcon />
            <span className="absolute -right-2.5 -top-2 grid min-w-[1.35em] place-items-center rounded-full bg-accent px-1 text-caption font-bold leading-[1.35em] text-on-accent tabular-nums">
              {cart.count}
            </span>
          </span>
          <span className="text-body font-semibold tabular-nums">{formatPrice(cart.total)}</span>
        </button>
      </div>
    </header>
  );
}

function SearchBox() {
  const { t, query, setQuery, frozen } = useShop();
  return (
    <label className="relative flex max-w-[520px] flex-1 items-center">
      <span className="sr-only">{t("shop.searchLabel")}</span>
      <span className="pointer-events-none absolute left-3 text-muted">
        <SearchIcon />
      </span>
      <input
        type="search"
        tabIndex={frozen ? -1 : 0}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("shop.searchPlaceholder")}
        className="w-full rounded-lg border border-line bg-bg py-2 pl-10 pr-3 text-body text-fg outline-none placeholder:text-muted focus:border-focus [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label={t("shop.clearSearch")}
          className="absolute right-2 grid place-items-center rounded-md p-1 text-muted hover:bg-surface-hover hover:text-fg"
        >
          <CloseIcon width="1em" height="1em" />
        </button>
      )}
    </label>
  );
}

function CategoryButton({ c, onPick, role }: { c: Category; onPick: (c: Category) => void; role?: string }) {
  const { category, query } = useShop();
  const selected = category === c && !query;
  return (
    <button
      type="button"
      role={role}
      aria-current={selected ? "page" : undefined}
      onClick={() => onPick(c)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-body transition-colors ${
        selected ? "bg-accent-soft font-semibold text-on-accent-soft" : "text-fg hover:bg-surface-hover"
      }`}
    >
      <span>{c}</span>
      <span className={`text-caption tabular-nums ${selected ? "text-on-accent-soft" : "text-muted"}`}>{COUNTS.get(c)}</span>
    </button>
  );
}

export function CategorySidebar() {
  const { t, selectCategory } = useShop();
  return (
    <nav
      aria-label={t("shop.categories")}
      style={{ viewTransitionName: "shop-sidebar", width: "calc(var(--fs-base) * 14)" } as React.CSSProperties}
      className="sticky top-[calc(var(--fs-base)*4+1.5rem)] shrink-0 self-start"
    >
      <h2 className="px-3 pb-2 text-caption font-semibold uppercase tracking-wider text-muted">{t("shop.categories")}</h2>
      <ul className="flex flex-col gap-1">
        {CATEGORIES.map((c) => (
          <li key={c}>
            <CategoryButton c={c} onPick={selectCategory} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CategoryDropdown() {
  const { t, selectCategory, category, query, frozen } = useShop();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wrap.current?.querySelector<HTMLButtonElement>("[aria-current=page], [role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0" style={{ viewTransitionName: "shop-dropdown" } as React.CSSProperties}>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={frozen ? -1 : 0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-body font-semibold transition-colors ${
          open ? "border-accent bg-accent-soft text-on-accent-soft" : "border-line bg-surface text-fg hover:bg-surface-hover"
        }`}
      >
        {t("shop.categories")}
        <ChevronDown width="1.1em" height="1.1em" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-40 rounded-xl border border-line bg-surface p-2 shadow-card [animation:pop-in_120ms_ease-out]"
          style={{ width: "calc(var(--fs-base) * 16)", boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}
        >
          {CATEGORIES.map((c) => (
            <div key={c} className="relative">
              <CategoryButton
                c={c}
                role="menuitem"
                onPick={(picked) => {
                  selectCategory(picked);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              />
              {category === c && !query && (
                <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-on-accent-soft">
                  <CheckIcon width="1em" height="1em" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
