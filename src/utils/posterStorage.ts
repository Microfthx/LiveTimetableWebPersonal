import type { EventData } from "../types/timetable";

const DATABASE = "live-idol-timetable-personal";
const STORE = "posters";
const CURRENT = "current";

interface StoredPoster {
  signature: string;
  blob: Blob;
  name: string;
  type: string;
}

/** Delay is deliberately excluded: changing it must not invalidate the poster. */
export function posterSignature(data: EventData): string {
  return JSON.stringify({
    event: data.event,
    groups: data.groups.map(({ id, name, start_time, end_time, crop }) => ({
      id,
      name,
      start_time,
      end_time,
      crop,
    })),
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("浏览器不支持 IndexedDB。"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("海报存储不可用。"));
    request.onblocked = () => reject(new Error("海报存储正在被其他页面占用。"));
  });
}

async function writePoster(record: StoredPoster | null): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    if (record) store.put(record, CURRENT);
    else store.delete(CURRENT);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("海报保存失败。"));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("海报保存失败。"));
    };
  });
}

export function savePosterBlob(data: EventData, file: File): Promise<void> {
  return writePoster({
    signature: posterSignature(data),
    blob: file,
    name: file.name,
    type: file.type,
  });
}

export function deletePosterBlob(): Promise<void> {
  return writePoster(null);
}

export async function getPosterBlob(data: EventData): Promise<File | null> {
  const db = await openDatabase();
  const record = await new Promise<StoredPoster | undefined>(
    (resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(CURRENT);
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result as StoredPoster | undefined);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error("海报读取失败。"));
      };
    },
  );
  if (
    !record ||
    record.signature !== posterSignature(data) ||
    !(record.blob instanceof Blob)
  )
    return null;
  return new File([record.blob], record.name || "poster", {
    type: record.type || record.blob.type,
  });
}
