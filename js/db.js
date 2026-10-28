export const DB_NAME = 'cimiento-db';
export const DB_VERSION = 1;

export const STORES = [
  'meta','readings','plans','prayerDays','prayerSessions','prayerRequests','attendance',
  'teachings','highlights','favorites','memoryPassages','goals','weeklyReviews','settings'
];

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('readings')) {
        const s = db.createObjectStore('readings', { keyPath: 'id' }); s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prayerDays')) db.createObjectStore('prayerDays', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('prayerSessions')) {
        const s = db.createObjectStore('prayerSessions', { keyPath: 'id' }); s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('prayerRequests')) db.createObjectStore('prayerRequests', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('attendance')) {
        const s = db.createObjectStore('attendance', { keyPath: 'id' }); s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('teachings')) db.createObjectStore('teachings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('highlights')) db.createObjectStore('highlights', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('memoryPassages')) db.createObjectStore('memoryPassages', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('weeklyReviews')) db.createObjectStore('weeklyReviews', { keyPath: 'weekStart' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function getAll(storeName) {
  const db = await openDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getOne(storeName, key) {
  const db = await openDb();
  return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await transactionDone(tx);
  return value;
}

export async function remove(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
}

export async function clear(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  await transactionDone(tx);
}

export async function dumpAllStores() {
  const result = {};
  for (const store of STORES) result[store] = await getAll(store);
  return result;
}

export async function replaceAllStores(data) {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  for (const store of STORES) {
    const objectStore = tx.objectStore(store);
    objectStore.clear();
    for (const item of (data[store] ?? [])) objectStore.put(item);
  }
  await transactionDone(tx);
}

export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}
