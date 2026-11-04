import { createContext, useContext } from "react";
import type { DemoStore } from "../data/demoStore";

export const DemoStoreContext = createContext<DemoStore | null>(null);

export function useDemoStore(): DemoStore {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("DemoStoreContext belum tersedia");
  return store;
}
