/** Number formats shared by the demos. */
export const n = (x: number) => Math.round(x).toLocaleString("en-GB");
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const dollars = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
