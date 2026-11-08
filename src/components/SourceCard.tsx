import type { ReactNode } from 'react';

export function SourceCard({
  title,
  hint,
  error,
  children,
}: {
  title: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="source-card">
      <h2 className="source-card__title">{title}</h2>
      {hint && <p className="source-card__hint">{hint}</p>}
      <div className="source-card__body">{children}</div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
