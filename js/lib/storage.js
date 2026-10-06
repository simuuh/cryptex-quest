/**
 * Tiny JSON storage that prefers localStorage and silently falls back to
 * memory (private mode, blocked storage, file:// quirks).
 */

/**
 * @param {string} key
 * @param {Storage|null} [backend] defaults to window.localStorage when available
 * @returns {{ load: () => any, save: (value: any) => void, clear: () => void, persistent: boolean }}
 */
export function createStorage(key, backend = getLocalStorage()) {
  const memory = new Map();
  let persistent = Boolean(backend);

  function load() {
    if (persistent) {
      try {
        const raw = backend.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        persistent = false;
      }
    }
    return memory.has(key) ? structuredCloneSafe(memory.get(key)) : null;
  }

  function save(value) {
    memory.set(key, structuredCloneSafe(value));
    if (!persistent) return;
    try {
      backend.setItem(key, JSON.stringify(value));
    } catch {
      persistent = false;
    }
  }

  function clear() {
    memory.delete(key);
    try {
      backend?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return {
    load,
    save,
    clear,
    get persistent() {
      return persistent;
    },
  };
}

function getLocalStorage() {
  try {
    const storage = globalThis.localStorage;
    const probe = '__cryptex_quest_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function structuredCloneSafe(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
