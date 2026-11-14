const DB_NAME = 'chief_offline_db';
const DB_VERSION = 1;
const STORE_GET = 'get_cache';
const STORE_QUEUE = 'sync_queue';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_GET)) {
        db.createObjectStore(STORE_GET, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGetCache(key, payload) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_GET, 'readwrite');
    tx.objectStore(STORE_GET).put({ key, payload, savedAt: Date.now() });
  } catch {
    // Fallback silencioso si IndexedDB está restringido
  }
}

export async function readGetCache(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_GET, 'readonly');
      const req = tx.objectStore(STORE_GET).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function enqueueMutation(item) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).add({ ...item, queuedAt: Date.now() });
  } catch {
    // Fallback silencioso
  }
}

export async function getQueuedMutations() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteQueuedMutation(id) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
  } catch {
    // Fallback silencioso
  }
}
