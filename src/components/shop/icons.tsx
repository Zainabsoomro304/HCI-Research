import type { SVGProps } from "react";
import type { Category } from "@/config/shop";

type P = SVGProps<SVGSVGElement>;
const base = { width: "1.25em", height: "1.25em", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const BasketIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9Z" />
    <path d="M8 9l3-5M16 9l-3-5M9 13v3M15 13v3M12 13v3" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MinusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);
export const InfoIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </svg>
);
export const StoreIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

/** One pictogram per category, used on the category buttons. */
export const CATEGORY_ICONS: Record<Category, (p: P) => React.ReactElement> = {
  fruitsVeg: (p) => (
    <svg {...base} {...p}>
      <path d="M12 8c-4-2-8 1-7 6 .8 4 3.5 7 7 7s6.2-3 7-7c1-5-3-8-7-6Z" />
      <path d="M12 8c0-2 1-4 3-5" />
    </svg>
  ),
  grains: (p) => (
    <svg {...base} {...p}>
      <path d="M12 21V8" />
      <path d="M12 12c-3 0-5-2-5-5 3 0 5 2 5 5ZM12 12c3 0 5-2 5-5-3 0-5 2-5 5ZM12 17c-3 0-5-2-5-5 3 0 5 2 5 5ZM12 17c3 0 5-2 5-5-3 0-5 2-5 5ZM12 8c-1.5-1-2-2.5-1-5 2 1.2 2 3 1 5Z" />
    </svg>
  ),
  dairy: (p) => (
    <svg {...base} {...p}>
      <path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3Z" />
      <path d="M7 12h10" />
    </svg>
  ),
  spices: (p) => (
    <svg {...base} {...p}>
      <path d="M14 6c4 1 6 5 4 9-2.5 5-9 7-13 6 5-2 7-5 6-9-.6-3 .5-5.5 3-6Z" />
      <path d="M14 6c0-2 1-3 3-3" />
    </svg>
  ),
  tea: (p) => (
    <svg {...base} {...p}>
      <path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6Z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M9 3c-1 1.5 1 2.5 0 4M13 3c-1 1.5 1 2.5 0 4" />
    </svg>
  ),
  oil: (p) => (
    <svg {...base} {...p}>
      <path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11Z" />
      <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  ),
  bakery: (p) => (
    <svg {...base} {...p}>
      <path d="M5 11a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
      <path d="M10 8v3M14 8v3" />
    </svg>
  ),
  cleaning: (p) => (
    <svg {...base} {...p}>
      <path d="M8 9h6l1 3v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8Z" />
      <path d="M9 9V6h3l3-2M12 6h3M18 6h.01M20 9h.01M18 12h.01" />
    </svg>
  ),
};
