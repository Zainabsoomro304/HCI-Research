"use client";

import { useEffect, useState } from "react";

/**
 * False during server rendering and until React has hydrated. Submit buttons stay disabled until then, so a fast
 * click can never trigger a native form submit (page reload) or be silently dropped.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
