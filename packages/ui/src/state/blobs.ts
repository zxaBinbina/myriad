/** 用 IndexedDB 保存较大的二进制内容（上传的壁纸） */
const DB_NAME = 'myriad'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const blobStore = {
  get: (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key)),
  put: (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key)).then(() => undefined),
  delete: (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined),
}
