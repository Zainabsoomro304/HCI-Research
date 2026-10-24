"use client";

import { createContext, useContext } from "react";
import type { UIConfig } from "@/config/uiSpace";
import type { Category } from "@/config/shop";
import type { Product } from "@/lib/catalog";
import type { Translate } from "@/lib/strings";
import type { EventType } from "@/lib/events";

export type ShopMode = "preview" | "task" | "practice" | "clip";

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartApi {
  lines: CartLine[];
  count: number;
  total: number;
  quantityOf(productId: string): number;
  add(productId: string, source: "card" | "detail"): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
}

export interface ShopContextValue {
  config: UIConfig;
  mode: ShopMode;
  t: Translate;
  emit(type: EventType, payload?: Record<string, unknown>): void;
  cart: CartApi;
  category: Category | null;
  selectCategory(c: Category): void;
  query: string;
  setQuery(q: string): void;
  openProduct(p: Product): void;
  openCart(): void;
  /** Interactive features disabled (clip/screenshot mode). */
  frozen: boolean;
}

export const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const v = useContext(ShopContext);
  if (!v) throw new Error("useShop must be used inside <Shop>");
  return v;
}
