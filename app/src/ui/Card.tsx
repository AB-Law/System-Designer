import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  actions,
  className = "",
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={"ui-card " + className} {...rest}>
      {(title || actions) && (
        <header className="ui-card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="ui-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
