/**
 * Where the sessions list was left, kept for the browser tab so a report can close back to it: the list's
 * address (with its filters) and its own view state (sort order, folded months).
 */
const URL_KEY = 'sessions:list-url';
const VIEW_KEY = 'sessions:list-view';

const store = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const saveListUrl = (url: string) => {
  try { store()?.setItem(URL_KEY, url); } catch { /* a convenience only */ }
};

/** Only a path on this site: the stored value is never trusted as a link target. */
export const readListUrl = (): string | null => {
  try {
    const v = store()?.getItem(URL_KEY) ?? null;
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
  } catch {
    return null;
  }
};

export interface ListView {
  sort?: { key: string; dir: 'asc' | 'desc' };
  folded?: string[];
}

export const saveListView = (view: ListView) => {
  try { store()?.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* a convenience only */ }
};

export const readListView = (): ListView => {
  try {
    const v = JSON.parse(store()?.getItem(VIEW_KEY) ?? '{}') as ListView;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
