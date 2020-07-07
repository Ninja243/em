/**
 * This script runs client-side (in the browser console) and operate directly on in-memory data using window.em and then dispatching updateThoughts to sync.
 */

/** Recursively traverses the contextIndex starting with the root, and performs several automatic fixes on all reachable descendants (with the corresponding context in thoughtIndex as needed):
 *   - missing lexeme
 *   - missing rank
 *   - missing id
 *   - inconsistent rank between contextIndex and thoughtIndex
 */
let repair = (maxDepth = 100) => {
  const { contextIndex, thoughtIndex } = em.store.getState().thoughts
  const contextIndexUpdates = {}
  const thoughtIndexUpdates = {}

  let duplicateRankUpdates = 0
  let missingLexemes = 0
  let missingLexemeContext = 0
  let missingChildRanks = 0
  let missingChildIds = 0
  let missingLexemeRanks = 0
  let missingLexemeIds = 0
  let inconsistentRanks = 0
  let duplicateThoughtContextIds = 0

  const ROOT_TOKEN = '__ROOT__'

  /** Generate a timestamp of now. */
  const timestamp = () => new Date().toISOString()

  /** Remove the root token. */
  const unroot = thoughts =>
    thoughts.length > 0 && (thoughts[0] === ROOT_TOKEN || thoughts[0].value === ROOT_TOKEN)
      ? thoughts.slice(1)
      : thoughts

  /** Equality for lists. */
  const equalArrays = (a, b) =>
    a === b ||
    (a && b &&
    a.length === b.length &&
    a.find &&
    // compare with null to avoid false positive for ''
    a.find((thought, i) => b[i] !== thought)) == null

  const generateUpdates = (context, depth = 0) => {
    if (depth >= maxDepth) return

    const contextEncoded = em.hashContext(context)
    const parentEntry = contextIndexUpdates[contextEncoded] || contextIndex[contextEncoded]
    const children = parentEntry?.children ?? []

    children.forEach((child, i) => {

      // console.log('child1', child)

      // use contextIndexUpdates since children may have been updated
      const parentEntry = contextIndexUpdates[contextEncoded] || contextIndex[contextEncoded]
      const rankRandom = Math.floor(Math.random() * 100000000000)
      const idRandom = Math.floor(Math.random() * 100000000000).toString()
      const noRank = child.rank == null
      const noId = child.id == null
      const hasDuplicateRank = parentEntry.children.some(childInner => childInner !== child && childInner.rank === child.rank)
      const updateContextIndex = noId || noRank || hasDuplicateRank

      if (noId) missingChildIds++
      if (noRank) missingChildRanks++
      if (hasDuplicateRank) duplicateRankUpdates++

      // fix null or undefined rank in contextIndex
      if (updateContextIndex) {
        // console.log('no rank or no id')
        // console.log('child', child)
        contextIndexUpdates[contextEncoded] = {
          children: parentEntry.children.map((childInner, j) => {
            if (i === j) {
              // overwrite forEach child for later use recreating lexemes
              child = {
                ...childInner,
                rank: hasDuplicateRank ? rankRandom : childInner.rank || rankRandom,
                id: childInner.id || idRandom,
                lastUpdated: timestamp(),
              }
              // console.log('child2', child)
              return child
            }
            else {
              return childInner
            }
          }),
          lastUpdated: timestamp(),
        }
      }

      const thoughtEncoded = em.hashThought(child.value)
      const lexeme = thoughtIndexUpdates[thoughtEncoded] || em.getThought(child.value)

      // recreate missing lexeme
      if (!lexeme) {

        missingLexemes++
        thoughtIndexUpdates[thoughtEncoded] = {
          value: child.value,
          created: parentEntry.lastUpdated,
          lastUpdated: timestamp(),
          contexts: [{
            context,
            id: child.id,
            rank: child.rank,
            lastUpdated: timestamp()
          }]
        }
      }
      // repair existing lexeme
      else {
        let shouldUpdate = false

        // only set this to true when at least one context is found with a matching context
        let hasLexemeContext = false

        // console.log('child', child)
        // console.log('lexeme.contexts', lexeme.contexts)
        const contextsNew = lexeme.contexts.reduce((accum, thoughtContext) => {

          const matchingContext = equalArrays(thoughtContext.context, context)

          // if (!matchingContext && noId) {
          //   console.log('!matchingContext && noId')
          //   console.log('context', context)
          //   console.log('child', child)
          //   console.log('thoughtContext', thoughtContext)
          // }

          if (!matchingContext) return [...accum, thoughtContext]

          hasLexemeContext = true
          const hasDuplicateId = accum.some(thoughtContext => thoughtContext.id === child.id)
          const hasInconsistentRank = !hasDuplicateRank && child.rank !== thoughtContext.rank
          const isMissingLexemeRank = thoughtContext.rank == null

          if (isMissingLexemeRank) missingLexemeRanks++
          if (hasInconsistentRank) inconsistentRanks++

          if (
            // fix null or undefined rank in thoughtContext
            isMissingLexemeRank ||
            // fix inconsistent rank
            hasInconsistentRank ||
            // if the contextIndex child was updated, then we need to set the thoughtIndex rank and id to match even if the lexeme is otherwise correct
            updateContextIndex
          ) {

            // flag shouldUpdate so the lexeme is replaced
            shouldUpdate = true

            // if thoughtContext has a duplicate id, return accum as-is, omitting the duplicate
            if (hasDuplicateId) {
              duplicateThoughtContextIds++
              return accum
            }

            // add new lexeme context with correct id and rank
            return [...accum, {
              ...thoughtContext,
              id: child.id,
              rank: child.rank,
              lastUpdated: timestamp()
            }]
          }
          else {
            return [...accum, thoughtContext]
          }
        }, [])

        // if any of the contexts within the lexeme have changed, update the lexeme
        if (shouldUpdate) {


          thoughtIndexUpdates[thoughtEncoded] = {
            value: lexeme.value || child.value,
            created: parentEntry.lastUpdated,
            lastUpdated: timestamp(),
            contexts: contextsNew
          }
        }
        else if (!hasLexemeContext) {


          missingLexemeContext++
          const lexemeNew = {
            ...lexeme,
            contexts: [...lexeme.contexts, {
              context,
              id: child.id,
              rank: child.rank,
              lastUpdated: timestamp()
            }],
            lastUpdated: timestamp(),
          }
          thoughtIndexUpdates[thoughtEncoded] = lexemeNew
        }
      }

      const contextNew = [...unroot(context), child.value]
      generateUpdates(contextNew, depth + 1) // RECURSION
    })

  }

  // start recursion
  generateUpdates(['__ROOT__'])

  console.info('')
  console.info(`Duplicate ranks: ${duplicateRankUpdates}`)
  console.info(`Missing lexemes: ${missingLexemes}`)
  console.info(`Missing lexeme contexts: ${missingLexemeContext}`)
  console.info(`Missing child ranks: ${missingChildRanks}`)
  console.info(`Missing child ids: ${missingChildIds}`)
  console.info(`Missing lexeme ranks: ${missingLexemeRanks}`)
  console.info(`Missing lexeme ids: ${missingLexemeIds}`)
  console.info(`Inconsistent ranks: ${inconsistentRanks}`)
  console.info(`Duplicate ThoughtContext ids: ${duplicateThoughtContextIds}`)

  const numParentUpdates = Object.keys(contextIndexUpdates).length
  const numLexemeUpdates = Object.keys(thoughtIndexUpdates).length
  if (numParentUpdates > 0 || numLexemeUpdates > 0) {
    console.info(`Updating ${numParentUpdates} parents.`)
    console.info(`Updating ${numLexemeUpdates} lexemes.`)
    // console.log('contextIndexUpdates', contextIndexUpdates)
    // console.log('thoughtIndexUpdates', thoughtIndexUpdates)
    em.store.dispatch({
      type: 'updateThoughts',
      contextIndexUpdates,
      thoughtIndexUpdates,
    })
  }
  else {
    console.info('No updates.')
  }
}

fixThoughtIndex(20)