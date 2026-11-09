'use client';
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

/**
 * A file picker that is not the browser's: a drop zone that names the chosen file.
 * The real input stays in the DOM (visually hidden) so labels, forms and tests keep working.
 */
export function FileField({
  label,
  accept,
  onChange,
  fileName,
  hint = 'Izaberite fajl ili ga prevucite ovde',
}: {
  label: string;
  accept: string;
  onChange: (ev: ChangeEvent<HTMLInputElement>) => void;
  fileName?: string | null;
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const files = e.dataTransfer.files;
    if (!files.length || !input.current) return;
    input.current.files = files;
    input.current.dispatchEvent(new Event('change', { bubbles: true }));
  };

  return (
    <div className="ui-file">
      <span className="ui-label">{label}</span>
      <label
        htmlFor={id}
        className="ui-file__zone"
        data-over={over || undefined}
        data-filled={fileName ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input id={id} ref={input} type="file" accept={accept} onChange={onChange} aria-label={label} className="sr-only" />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="ui-file__text">{fileName ?? hint}</span>
        <span className="ui-file__btn">{fileName ? 'Promeni' : 'Izaberi'}</span>
      </label>
    </div>
  );
}
