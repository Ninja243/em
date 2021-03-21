import { Index, Lexeme, Parent } from '../types'
import { State } from '../util/initialState'
import { Dispatch } from 'react'
import * as db from './detaDexie'

/**
 * Get all firebase related functions as an object.
 */
const getFirebaseProvider = (state: State, dispatch: Dispatch<any>) => ({

  /** Deletes all data in the data provider. */
  clearAll: () => {
    throw new Error('NOT IMPLEMENTED')
  },

  /** Gets the Lexeme object by id. */
  async getThoughtById (id: string): Promise<Lexeme | undefined> {
    return db.getThoughtById(id)
  },
  /** Gets multiple Lexeme objects by ids. */
  async getThoughtsByIds(ids: string[]): Promise<(Lexeme | undefined)[]> {
    return db.getThoughtsByIds(ids)
  },

  /**
   * Gets a context by id.
   *
   * @param conte,xt
   */
  async getContextById(id: string): Promise<Parent | undefined> {
    return db.getContextById(id)
  },
  /** Gets multiple PrentEntry objects by ids. */
  getContextsByIds: async (ids: string[]): Promise<(Parent | undefined)[]> => {
    return db.getContextsByIds(ids)
  },
  /** Updates Firebase data. */
  async update(updates: Index<any>) {
    db.updateContextIndex(updates)
  },
  /** Updates a context in the contextIndex. */
  async updateContext(id: string, parentEntry: Parent): Promise<unknown> {
    return db.updateContext(id, parentEntry)
  },
  /** Updates a thought in the thoughtIndex. */
  async updateThought(id: string, thought: Lexeme): Promise<unknown> {
    return db.updateThought(id, thought)
  },
  /** Updates the contextIndex. */
  async updateContextIndex(contextIndex: Index<Parent>): Promise<unknown> {
    return db.updateContextIndex(contextIndex)
  },
  /** Updates the thoughtIndex. */
  async updateThoughtIndex(thoughtIndex: Index<Lexeme>): Promise<unknown> {
    return db.updateThoughtIndex(thoughtIndex)
  }
})

export default getFirebaseProvider
