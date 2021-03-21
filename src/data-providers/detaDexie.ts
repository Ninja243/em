/* eslint-disable fp/no-this */
import _ from 'lodash'
import { timestamp } from '../util'
import { Context, Index, Lexeme, Parent, Timestamp } from '../types'
import { detaProjectKey } from '../keys/.keys'
import { Deta, DetaBase, DetaInstance } from 'deta'

export interface Helper {
  id: string,
  value?: string,
  contexts?: Context[],
  cursor?: string | null,
  created?: Timestamp,
  lastUpdated?: Timestamp,
  recentlyEdited?: Index,
}

export interface Log {
  created: Timestamp,
  message: string,
  stack?: any,
}

/** Wrapper for the DetaBases, letting me store info on the name of the base as that info isn't stored inside the base object. */
// eslint-disable-next-line fp/no-class
class WrappedDetaBase {
  base: DetaBase;
  name: string;

  constructor(baseName: string, deta: DetaInstance) {
    this.base = deta.Base(baseName)
    this.name = baseName
  }

  async add(object: any) {
    await this.base.put(object, (object as Helper).id)
  }

  async put(object: any) {
    await this.base.put(object, (object as Helper).id)
  }

  async bulkPut(object: any) {
    await this.base.putMany(object)
  }

  async bulkGet(ids: string[]) {
    return ids.map(async id => {
      return await this.get(id)
    })
  }

  async delete(id: string) {
    await this.base.delete(id)
  }

  async get(object:string) {
    return await this.base.get(object)
  }

  async toArray():Promise<any[]> {
    const items = await this.base.fetch({ 'key?ne': '' })
    if (Array.isArray(items)) {
      return items
    }
    return [items]
  }

  async update(id: string, object: unknown) {
    // Can't use const here
    let update = {}
    if (object instanceof Number) {
      update = {
        schemaVersion: object
      }
    }
    if (object as Timestamp) {
      update = {
        lastUpdated: object
      }
    }
    if (object as Index) {
      update = {
        recentlyEdited: object
      }
    }
    if (object as string || object === null) {
      update = {
        cursor: object
      }
    }
    await this.base.update(update, id)
  }

  async clear() {
    (await this.toArray()).map(item => {
      const i = item as Helper
      this.base.delete(i.id)
      return i
    })
  }
}

/** Rewritten to use DetaBase instead of dexie. */
// eslint-disable-next-line fp/no-class
class EM {
  contextIndex: WrappedDetaBase;
  thoughtIndex: WrappedDetaBase;
  helpers: WrappedDetaBase;
  logs: WrappedDetaBase;

  readyState: boolean

  constructor() {
    const deta = Deta(detaProjectKey)
    this.contextIndex = new WrappedDetaBase('contextIndex', deta)
    this.thoughtIndex = new WrappedDetaBase('thoughtIndex', deta)
    this.helpers = new WrappedDetaBase('helpers', deta)
    this.logs = new WrappedDetaBase('logs', deta)
    this.readyState = true
  }

  isOpen() {
    return this.readyState
  }
}

const db = new EM()

/** Initializes the EM record where helpers are stored. */
const initHelpers = async () => {
  const staticHelpersExist = await db.helpers.get('EM')
  if (!staticHelpersExist) {
    await db.helpers.add({ id: 'EM' })
  }
}

/** Initializes the database tables. */
const initDB = async () => {
  // TODO init?
  await initHelpers()
}

/** Clears all thoughts and contexts from the indices. */
export const clearAll = () => Promise.all([
  db.thoughtIndex.clear(),
  db.contextIndex.clear(),
  db.helpers.clear()
])

/** Updates a single thought in the thoughtIndex. */
export const updateThought = async (id: string, thought: Lexeme) =>
  db.thoughtIndex.put({ id, ...thought })

/** Updates multiple thoughts in the thoughtIndex. */
export const updateThoughtIndex = async (thoughtIndexMap: Index<Lexeme | null>) => {
  const thoughtsArray = Object.keys(thoughtIndexMap).map(key => ({
    ...thoughtIndexMap[key] as Lexeme,
    id: key,
  }))
  return db.thoughtIndex.bulkPut(thoughtsArray)
}

/** Deletes a single thought from the thoughtIndex. */
export const deleteThought = (id: string) => db.thoughtIndex.delete(id)

/** Gets a single thought from the thoughtIndex by its id. */
export const getThoughtById = (id: string) => new Promise<Lexeme | undefined>(resolve => resolve(db.thoughtIndex.get(id) as unknown as Lexeme))

/** Gets multiple thoughts from the thoughtIndex by ids. */
export const getThoughtsByIds = async (ids: string[]): Promise<(Lexeme | undefined)[]> => {
  const snapshots = await Promise.all(
    ids.map(id => getThoughtById(id))
  )
  return snapshots
}

/** Gets the entire thoughtIndex. */
export const getThoughtIndex = async () => {
  const thoughtIndexMap = await db.thoughtIndex.toArray()
  return _.keyBy(thoughtIndexMap, 'id')
}

/** Updates a single thought in the contextIndex. Ignores parentEntry.pending. */
export const updateContext = async (id: string, { context, children, lastUpdated }: Parent) => {
  return db.contextIndex.put({ id, context, children, lastUpdated })
}

/** Updates multiple thoughts in the contextIndex. */
export const updateContextIndex = async (contextIndexMap: Index<Parent | null>) => {
  const contextsArray = Object.keys(contextIndexMap).map(key => ({
    ...contextIndexMap[key] as Parent,
    id: key,
  }))
  return db.contextIndex.bulkPut(contextsArray)
}

/** Deletes a single thought from the contextIndex. */
export const deleteContext = async (id: string) => db.contextIndex.delete(id)

/** Gets a context by id. */
export const getContextById = (id: string) => new Promise<Parent | undefined>(resolve => resolve(db.contextIndex.get(id) as unknown as Parent))

/** Gets multiple contexts from the thoughtIndex by ids. */
// export const getThoughtsByIds = (ids: string[]) => ids.map(id => getThoughtById(id))

export const getContextsByIds = async (ids: string[]): Promise<(Parent | undefined)[]> => {
  const snapshots = await Promise.all(
    ids.map(id => getContextById(id))
  )
  return snapshots
}

/** Gets the entire contextIndex. DEPRECATED. Use data-helpers/getDescendantThoughts. */
export const getContextIndex = async () => {
  const contextIndexMap = await db.contextIndex.toArray()
  // mapValues + keyBy much more efficient than reduce + merge
  return _.mapValues(_.keyBy(contextIndexMap, 'id'), 'context')
}

/** Updates the recentlyEdited helper. */
export const updateRecentlyEdited = async (recentlyEdited: Index) => db.helpers.update('EM', { recentlyEdited })

/** Updates the schema version helper. */
export const updateSchemaVersion = async (schemaVersion: number) => db.helpers.update('EM', { schemaVersion })

/** Updates the lastUpdates helper. */
export const updateLastUpdated = async (lastUpdated: Timestamp) => db.helpers.update('EM', { lastUpdated })

/** Gets all the helper values. */
export const getHelpers = async () => db.helpers.get('EM')

/** Updates the cursor helper. */
export const updateCursor = async (cursor: string | null) => db.helpers.update('EM', { cursor })

/** Deletes the cursor helper. */
export const deleteCursor = async () => db.helpers.update('EM', { cursor: null })

/** Gets the full logs. */
export const getLogs = async () => {
  return db.logs.toArray().then(ls => ls.map(l => l as Log))
}

/** Logs a message. */
export const log = async ({ message, stack }: { message: string, stack: any }) =>
  db.logs.add({ created: timestamp(), message, stack })

export default initDB
