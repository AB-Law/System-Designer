import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "primary" | "success" | "danger";
  size?: "small" | "normal" | "tall";
};

/** The existing `.btn` look, as a component. */
export function Button({ variant = "default", size = "normal", className = "", type = "button", ...rest }: Props) {
  const cls = ["btn", variant !== "default" && variant, size !== "normal" && size, className].filter(Boolean).join(" ");
  return <button type={type} className={cls} {...rest} />;
}
