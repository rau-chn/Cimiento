import { dumpAllStores, replaceAllStores, put, getOne, STORES } from './db.js';

export const BACKUP_SCHEMA_VERSION = 1;

export function createBackupDocument(data, exportedAt = new Date().toISOString()) {
  return {
    app: 'Cimiento',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    data
  };
}

export function validateBackupDocument(doc) {
  if (!doc || doc.app !== 'Cimiento') throw new Error('El archivo no es un respaldo de Cimiento.');
  if (doc.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Versión de respaldo no compatible: ${doc.schemaVersion}.`);
  if (!doc.data || typeof doc.data !== 'object') throw new Error('El respaldo no contiene datos válidos.');
  for (const store of STORES) if (!Array.isArray(doc.data[store])) throw new Error(`Falta el almacén ${store}.`);
  return true;
}

export async function exportBackup() {
  const exportedAt = new Date().toISOString();
  await put('meta', { key: 'lastBackupAt', value: exportedAt });
  const data = await dumpAllStores();
  const doc = createBackupDocument(data, exportedAt);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cimiento-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return doc;
}

export async function importBackupFile(file) {
  const text = await file.text();
  const doc = JSON.parse(text);
  validateBackupDocument(doc);
  await replaceAllStores(doc.data);
  return doc;
}

export async function backupStatus(now = Date.now()) {
  const entry = await getOne('meta', 'lastBackupAt');
  if (!entry?.value) return { state: 'never', days: null };
  const days = Math.floor((now - Date.parse(entry.value)) / 86400000);
  return { state: days > 7 ? 'overdue' : 'ok', days };
}
