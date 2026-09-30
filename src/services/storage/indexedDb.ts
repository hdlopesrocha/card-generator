import type { Card } from '@/models/Card'

const DEFAULT_DATABASE_NAME = 'card-generator'
/** Version 2 adds the `images` store used by the local image library. */
const DEFAULT_DATABASE_VERSION = 2
const CARDS_STORE_NAME = 'cards'
export const IMAGES_STORE_NAME = 'images'
const STORAGE_UNAVAILABLE_MESSAGE = 'Local storage is not available in this browser.'
const OPERATION_FAILED_MESSAGE = 'The local database operation failed.'

export class StorageUnavailableError extends Error {
  constructor(message: string = STORAGE_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = 'StorageUnavailableError'
  }
}

export interface StoredImage {
  id: string
  /** File name used to reference the image from a CSV `image` column. */
  name: string
  dataUrl: string
  /** Original file size in bytes. */
  size: number
  createdAt: string
}

interface RepositoryOptions {
  factory?: IDBFactory
  databaseName?: string
  version?: number
}

function getFactory(factory: IDBFactory | undefined): IDBFactory {
  const resolved = factory ?? globalThis.indexedDB
  if (!resolved) throw new StorageUnavailableError()
  return resolved
}

function openDatabase(
  factory: IDBFactory | undefined,
  databaseName: string,
  version: number,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let resolvedFactory: IDBFactory
    try {
      resolvedFactory = getFactory(factory)
    } catch (error) {
      reject(error)
      return
    }

    let openRequest: IDBOpenDBRequest
    try {
      openRequest = resolvedFactory.open(databaseName, version)
    } catch {
      reject(new StorageUnavailableError())
      return
    }

    openRequest.onupgradeneeded = () => {
      const database = openRequest.result
      if (!database.objectStoreNames.contains(CARDS_STORE_NAME)) {
        database.createObjectStore(CARDS_STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(IMAGES_STORE_NAME)) {
        database.createObjectStore(IMAGES_STORE_NAME, { keyPath: 'id' })
      }
    }
    openRequest.onsuccess = () => resolve(openRequest.result)
    openRequest.onerror = () => reject(openRequest.error ?? new Error(OPERATION_FAILED_MESSAGE))
    openRequest.onblocked = () =>
      reject(new Error('The local database is blocked by another browser tab.'))
  })
}

abstract class IndexedDbRepository<TValue> {
  private readonly factory: IDBFactory | undefined
  private readonly databaseName: string
  private readonly version: number
  private databasePromise: Promise<IDBDatabase> | null = null

  protected constructor(
    private readonly storeName: string,
    options: RepositoryOptions = {},
  ) {
    this.factory = options.factory
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME
    this.version = options.version ?? DEFAULT_DATABASE_VERSION
  }

  async init(): Promise<void> {
    await this.open()
  }

  async getAll(): Promise<TValue[]> {
    const values = await this.transact<TValue[]>(
      'readonly',
      (store) => store.getAll() as IDBRequest<TValue[]>,
    )
    return Array.isArray(values) ? values : []
  }

  async get(id: string): Promise<TValue | undefined> {
    return this.transact<TValue | undefined>(
      'readonly',
      (store) => store.get(id) as IDBRequest<TValue | undefined>,
    )
  }

  async put(value: TValue): Promise<void> {
    await this.transact<IDBValidKey>('readwrite', (store) => store.put(value))
  }

  async bulkPut(values: TValue[]): Promise<void> {
    const [first, ...rest] = values
    if (first === undefined) return

    await this.transact<IDBValidKey>('readwrite', (store) => {
      let request = store.put(first)
      for (const value of rest) {
        request = store.put(value)
      }
      return request
    })
  }

  async delete(id: string): Promise<void> {
    await this.transact<undefined>('readwrite', (store) => store.delete(id))
  }

  async clear(): Promise<void> {
    await this.transact<undefined>('readwrite', (store) => store.clear())
  }

  async count(): Promise<number> {
    const total = await this.transact<number>('readonly', (store) => store.count())
    return typeof total === 'number' ? total : 0
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase(this.factory, this.databaseName, this.version)
      this.databasePromise.catch(() => {
        this.databasePromise = null
      })
    }
    return this.databasePromise
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open()

    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = database.transaction(this.storeName, mode)
      } catch {
        reject(new Error(OPERATION_FAILED_MESSAGE))
        return
      }

      let result: T | undefined

      transaction.oncomplete = () => resolve(result as T)
      transaction.onerror = () => reject(transaction.error ?? new Error(OPERATION_FAILED_MESSAGE))
      transaction.onabort = () => reject(transaction.error ?? new Error(OPERATION_FAILED_MESSAGE))

      let request: IDBRequest<T>
      try {
        request = work(transaction.objectStore(this.storeName))
      } catch (error) {
        transaction.abort()
        reject(error instanceof Error ? error : new Error(OPERATION_FAILED_MESSAGE))
        return
      }

      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error ?? new Error(OPERATION_FAILED_MESSAGE))
    })
  }
}

export class IndexedDbCardRepository extends IndexedDbRepository<Card> {
  constructor(
    factory?: IDBFactory,
    databaseName: string = DEFAULT_DATABASE_NAME,
    version: number = DEFAULT_DATABASE_VERSION,
  ) {
    super(CARDS_STORE_NAME, { factory, databaseName, version })
  }
}

export class IndexedDbImageRepository extends IndexedDbRepository<StoredImage> {
  constructor(
    factory?: IDBFactory,
    databaseName: string = DEFAULT_DATABASE_NAME,
    version: number = DEFAULT_DATABASE_VERSION,
  ) {
    super(IMAGES_STORE_NAME, { factory, databaseName, version })
  }
}

let sharedCardRepository: IndexedDbCardRepository | null = null
let sharedImageRepository: IndexedDbImageRepository | null = null

export function getCardRepository(): IndexedDbCardRepository {
  if (!sharedCardRepository) {
    const factory = globalThis.indexedDB
    if (!factory) throw new StorageUnavailableError()
    sharedCardRepository = new IndexedDbCardRepository(factory)
  }
  return sharedCardRepository
}

export function getImageRepository(): IndexedDbImageRepository {
  if (!sharedImageRepository) {
    const factory = globalThis.indexedDB
    if (!factory) throw new StorageUnavailableError()
    sharedImageRepository = new IndexedDbImageRepository(factory)
  }
  return sharedImageRepository
}
