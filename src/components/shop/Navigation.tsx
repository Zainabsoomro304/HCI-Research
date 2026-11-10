"use client";

import { CATEGORIES, STORE_NAME, formatPrice, type Category } from "@/config/shop";
import type { StringKey } from "@/lib/strings";
import { ActionButton } from "./ActionButton";
import { useShop } from "./context";
import { BasketIcon, CATEGORY_ICONS, CloseIcon, InfoIcon, SearchIcon, StoreIcon } from "./icons";

const vt = (name: string, cls?: string) => ({ viewTransitionName: name, ...(cls ? { viewTransitionClass: cls } : {}) }) as React.CSSProperties;

/** A fixed, friendly helper text (guidance = hints). The text never changes, so clips and tasks show the same words. */
export function Hint({ k, name, className = "" }: { k: StringKey; name: string; className?: string }) {
  const { config, t } = useShop();
  if (config.guidance !== "hints") return null;
  return (
    <p
      style={vt(name, "hint")}
      className={`flex items-start gap-[0.45em] rounded-[0.6em] bg-hint px-[0.8em] py-[0.45em] text-small font-medium text-on-hint ${className}`}
    >
      <InfoIcon width="1.1em" height="1.1em" className="mt-[0.2em] shrink-0" />
      <span>{t(k)}</span>
    </p>
  );
}

export function TopBar() {
  const { config, lang, t, cart, openCart } = useShop();
  return (
    <header style={vt("shop-topbar")} className="sticky top-0 z-30 border-b-[length:var(--bw)] border-line bg-surface-2">
      <div className="mx-auto flex max-w-[1440px] items-center gap-[1em] px-[1.2em] py-[0.6em]">
        <div className="flex shrink-0 items-center gap-[0.5em]">
          <span className="grid place-items-center rounded-[0.5em] bg-accent text-on-accent" style={{ width: "2.1em", height: "2.1em" }}>
            <StoreIcon />
          </span>
          <span className="text-brand font-bold text-fg">{STORE_NAME[lang]}</span>
        </div>
        <div className="flex min-w-0 max-w-[34em] flex-1 flex-col gap-[0.35em]">
          <SearchBox />
        </div>
        <div className="ms-auto flex shrink-0 items-center">
          <ActionButton
            tone="secondary"
            icon={
              <span className="inline-flex items-center gap-[0.3em]">
                <BasketIcon />
                <span className="grid min-w-[1.5em] place-items-center rounded-full bg-accent px-[0.3em] text-caption font-bold leading-[1.5em] text-on-accent tabular-nums">
                  <bdi dir="ltr">{cart.count}</bdi>
                </span>
              </span>
            }
            label={t("shop.basket")}
            ariaLabel={t("shop.basketButton", { count: cart.count, total: formatPrice(cart.total, lang) })}
            trailing={<bdi className="font-bold tabular-nums">{formatPrice(cart.total, lang)}</bdi>}
            onClick={openCart}
            className="text-body"
            style={vt("shop-basket", "act")}
          />
        </div>
      </div>
      {config.guidance === "hints" && (
        <div className="mx-auto flex max-w-[1440px] items-start justify-between gap-[1em] px-[1.2em] pb-[0.6em]">
          <Hint k="shop.hint.search" name="hint-search" />
          <Hint k="shop.hint.basket" name="hint-basket" />
        </div>
      )}
    </header>
  );
}

function SearchBox() {
  const { config, t, query, setQuery, frozen } = useShop();
  const showLabel = config.iconLabels === "iconText";
  return (
    <div className="flex items-stretch gap-[var(--tap-gap)]" role="search">
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">{t("shop.searchLabel")}</span>
        <span className="pointer-events-none absolute start-[0.7em] text-muted">
          <SearchIcon />
        </span>
        <input
          type="search"
          tabIndex={frozen ? -1 : 0}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("shop.searchPlaceholder")}
          className="min-h-[var(--tap)] w-full rounded-[0.55em] border-[length:var(--bw)] border-control bg-surface py-[0.3em] pe-[2.4em] ps-[2.4em] text-body text-fg outline-none placeholder:text-muted focus:border-focus [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("shop.clearSearch")}
            className="absolute end-[0.4em] grid place-items-center rounded-[0.4em] p-[0.25em] text-muted hover:bg-surface-hover hover:text-fg"
          >
            <CloseIcon width="1em" height="1em" />
          </button>
        )}
      </label>
      {showLabel && <ActionButton tone="secondary" icon={<SearchIcon />} label={t("shop.searchButton")} onClick={() => setQuery(query)} className="text-body" style={vt("shop-searchbtn", "act")} />}
    </div>
  );
}

function CategoryButton({ c }: { c: Category }) {
  const { config, t, category, query, selectCategory } = useShop();
  const selected = category === c && !query;
  const Icon = CATEGORY_ICONS[c];
  const label = t(`cat.${c}` as StringKey);
  // Selection is shown the same way in every button style: a soft fill plus an underline bar.
  return (
    <span className="relative inline-flex">
      <ActionButton
        tone="secondary"
        icon={<Icon />}
        label={label}
        onClick={() => selectCategory(c)}
        current={selected}
        className={`text-body ${selected ? (config.buttonStyle === "raised" ? "!bg-accent !text-on-accent" : "!bg-accent-soft !text-on-accent-soft") : ""}`}
      />
      {selected && <span aria-hidden className="absolute inset-x-[0.6em] -bottom-[0.35em] h-[0.18em] rounded-full bg-accent" />}
    </span>
  );
}

export function CategoryBar() {
  const { t } = useShop();
  return (
    <nav aria-label={t("shop.categories")} style={vt("shop-cats")} className="border-b-[length:var(--bw)] border-line bg-surface-2">
      <ul className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-[var(--tap-gap)] gap-y-[calc(var(--tap-gap)+0.35em)] px-[1.2em] pb-[0.75em] pt-[0.5em]">
        {CATEGORIES.map((c) => (
          <li key={c}>
            <CategoryButton c={c} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
