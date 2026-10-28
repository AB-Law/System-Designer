import { create } from "zustand";

export interface ToastItem {
  id: number;
  text: string;
  tone: "good" | "bad" | "neutral";
}

interface ToastState {
  items: ToastItem[];
  push: (text: string, tone?: ToastItem["tone"]) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (text, tone = "neutral") => {
    const id = next++;
    set((s) => ({ items: [...s.items.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, tone?: ToastItem["tone"]) => useToasts.getState().push(text, tone);

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="ui-toasts" aria-live="polite">
      {items.map((t) => (
        <button key={t.id} type="button" className={"ui-toast " + t.tone} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
