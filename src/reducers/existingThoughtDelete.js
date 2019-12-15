// util
import {
  hashContext,
  equalThoughtRanked,
  exists,
  getChildrenWithRank,
  getThought,
  hashThought,
  removeContext,
  rootedContextOf,
  head,
  sync,
  pathToContext,
} from '../util.js'

// SIDE EFFECTS: sync
export const existingThoughtDelete = (state, { thoughtsRanked, rank, showContexts }) => {

  const thoughts = pathToContext(thoughtsRanked)
  if (!exists(head(thoughts), state.thoughtIndex)) return

  const value = head(thoughts)
  const thought = getThought(value, state.thoughtIndex)
  const context = rootedContextOf(thoughts)
  const newData = { ...state.thoughtIndex }

  // the old thought less the context
  const newOldThought = thought.memberOf && thought.memberOf.length > 1
    ? removeContext(thought, context, showContexts ? null : rank)
    : null

  // update local thoughtIndex so that we do not have to wait for firebase
  if (newOldThought) {
    newData[hashThought(value)] = newOldThought
  }
  else {
    delete newData[hashThought(value)] // eslint-disable-line fp/no-delete
  }

  const contextEncoded = hashContext(context)
  const thoughtChildren = (state.contextIndex[contextEncoded] || [])
    .filter(child => !equalThoughtRanked(child, { key: value, rank }))

  // generates a firebase update object that can be used to delete/update all descendants and delete/update contextIndex
  const recursiveDeletes = (thoughtsRanked, accumRecursive = {}) => {
    return getChildrenWithRank(thoughtsRanked, newData, state.contextIndex).reduce((accum, child) => {
      const hashedKey = hashThought(child.key)
      const childThought = getThought(child.key, newData)
      const childNew = childThought && childThought.memberOf && childThought.memberOf.length > 1
        // update child with deleted context removed
        ? removeContext(childThought, pathToContext(thoughtsRanked), child.rank)
        // if this was the only context of the child, delete the child
        : null

      // update local thoughtIndex so that we do not have to wait for firebase
      if (childNew) {
        newData[hashedKey] = childNew
      }
      else {
        delete newData[hashedKey] // eslint-disable-line fp/no-delete
      }

      const contextEncoded = hashContext(pathToContext(thoughtsRanked))

      const dataMerged = {
        ...accumRecursive.thoughtIndex,
        ...accum.thoughtIndex,
        [hashedKey]: childNew
      }

      const contextIndexMerged = {
        ...accumRecursive.contextIndex,
        ...accum.contextIndex,
        [contextEncoded]: null
      }

      // RECURSION
      const recursiveResults = recursiveDeletes(thoughtsRanked.concat(child), {
        thoughtIndex: dataMerged,
        contextIndex: contextIndexMerged
      })

      return {
        thoughtIndex: {
          ...dataMerged,
          ...recursiveResults.thoughtIndex
        },
        contextIndex: {
          ...contextIndexMerged,
          ...recursiveResults.contextIndex
        }
      }
    }, {
      thoughtIndex: {},
      contextIndex: {}
    })
  }

  // do not delete descendants when the thought has a duplicate sibling
  const hasDuplicateSiblings = thoughtChildren.some(child => hashThought(child.key) === hashThought(value))
  const descendantUpdatesResult = !hasDuplicateSiblings
    ? recursiveDeletes(thoughtsRanked)
    : {
      thoughtIndex: {},
      contextIndex: {}
    }

  const thoughtIndexUpdates = {
    [hashThought(value)]: newOldThought,
    ...descendantUpdatesResult.thoughtIndex,
    // emptyContextDelete
  }

  const contextIndexUpdates = {
    // current thought
    [contextEncoded]: thoughtChildren.length > 0 ? thoughtChildren : null,
    // descendants
    ...descendantUpdatesResult.contextIndex
  }
  const newcontextIndex = Object.assign({}, state.contextIndex, contextIndexUpdates)

  // null values must be manually deleted in state
  // current thought
  if (!thoughtChildren || thoughtChildren.length === 0) {
    delete newcontextIndex[contextEncoded] // eslint-disable-line fp/no-delete
  }
  // descendants
  Object.keys(descendantUpdatesResult.contextIndex).forEach(contextEncoded => {
    const thoughtChildren = descendantUpdatesResult.contextIndex[contextEncoded]
    if (!thoughtChildren || thoughtChildren.length === 0) {
      delete newcontextIndex[contextEncoded] // eslint-disable-line fp/no-delete
    }
  })

  setTimeout(() => {
    // do not sync to state since this reducer returns the new state
    sync(thoughtIndexUpdates, contextIndexUpdates, { state: false })
  })

  return {
    thoughtIndex: newData,
    dataNonce: state.dataNonce + 1,
    contextIndex: newcontextIndex
  }
}