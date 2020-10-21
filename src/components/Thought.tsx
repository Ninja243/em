import React, { Dispatch, useEffect } from 'react'
import { Action } from 'redux'
import { connect } from 'react-redux'
import classNames from 'classnames'
import { ConnectDragPreview, ConnectDragSource, ConnectDropTarget, DragSource, DragSourceConnector, DragSourceMonitor, DropTarget, DropTargetConnector, DropTargetMonitor } from 'react-dnd'
import { getEmptyImage } from 'react-dnd-html5-backend'
import { isMobile } from '../browser'
import { store } from '../store'
import globals from '../globals'
import { alert, expandContextThought, toggleTopControlsAndBreadcrumbs } from '../action-creators'

// components
import Bullet from './Bullet'
import BulletCursorOverlay from './BulletCursorOverlay'
import Byline from './Byline'
import ContextBreadcrumbs from './ContextBreadcrumbs'
import Divider from './Divider'
import Editable from './Editable'
import HomeLink from './HomeLink'
import Note from './Note'
import Subthoughts from './Subthoughts'
import Superscript from './Superscript'
import ThoughtAnnotation from './ThoughtAnnotation'
import useLongPress from '../hooks/useLongPress'
import { MAX_DISTANCE_FROM_CURSOR, TIMEOUT_BEFORE_DRAG } from '../constants'
import { State } from '../util/initialState'
import { ActionCreator, Child, Path, SimplePath, ThoughtContext } from '../types'

// util
import {
  contextOf,
  ellipsize,
  equalArrays,
  equalPath,
  hashContext,
  head,
  headValue,
  isDivider,
  isDocumentEditable,
  isEM,
  isFunction,
  isRoot,
  isURL,
  pathToContext,
  publishMode,
  rootedContextOf,
  subsetThoughts,
  unroot,
} from '../util'

// selectors
import {
  attribute,
  attributeEquals,
  chain,
  getNextRank,
  getRankBefore,
  getSortPreference,
  getStyle,
  getThought,
  getThoughts,
  getThoughtsRanked,
  hasChild,
  hasChildren,
  isBefore,
  isContextViewActive,
} from '../selectors'

/**********************************************************************
 * Redux
 **********************************************************************/

interface ThoughtProps {
  contextChain: SimplePath[],
  cursorOffset?: number,
  hideBullet?: boolean,
  homeContext?: boolean,
  isDraggable?: boolean,
  isDragging?: boolean,
  isPublishChild?: boolean,
  isEditing?: boolean,
  isLeaf?: boolean,
  path: Path,
  publish?: boolean,
  rank: number,
  showContextBreadcrumbs?: boolean,
  showContexts?: boolean,
  style?: React.CSSProperties,
  simplePath: SimplePath,
  view?: string | null,
}

interface ThoughtContainerProps {
  allowSingleContext?: boolean,
  childrenForced?: Child[],
  contextBinding?: Path,
  contextChain: SimplePath[],
  count?: number,
  cursor?: Path | null,
  cursorOffset?: number,
  depth?: number,
  expanded?: boolean,
  expandedContextThought?: Path,
  hideBullet?: boolean,
  isDeepHovering?: boolean,
  isPublishChild?: boolean,
  isCursorGrandparent?: boolean,
  isCursorParent?: boolean,
  isDraggable?: boolean,
  isDragging?: boolean,
  isEditing?: boolean,
  isEditingPath?: boolean,
  isHovering?: boolean,
  isParentHovering?: boolean,
  prevChild?: Child | ThoughtContext,
  publish?: boolean,
  rank: number,
  showContexts?: boolean,
  style?: React.CSSProperties,
  thought?: Child,
  simplePath: SimplePath,
  simplePathLive?: SimplePath,
  url?: string | null,
  view?: string | null,
}

// eslint-disable-next-line jsdoc/require-jsdoc
const mapStateToProps = (state: State, props: ThoughtContainerProps) => {

  const {
    cursor,
    cursorOffset,
    cursorBeforeEdit,
    expanded,
    expandedContextThought,
    search,
  } = state

  const {
    contextChain,
    simplePath,
    showContexts,
    depth,
    childrenForced
  } = props

  // resolve thoughts that are part of a context chain (i.e. some parts of thoughts expanded in context view) to match against cursor subset
  const path = props.contextChain && props.contextChain.length > 0
    ? chain(state, props.contextChain, simplePath)
    : unroot(simplePath)

  // check if the cursor path includes the current thought
  const isEditingPath = subsetThoughts(cursorBeforeEdit, path)

  // check if the cursor is editing a thought directly
  const isEditing = equalPath(cursorBeforeEdit, path)

  const simplePathLive = isEditing
    ? contextOf(simplePath).concat(head(showContexts ? contextOf(cursor!) : cursor!)) as SimplePath
    : simplePath

  const distance = cursor ? Math.max(0,
    Math.min(MAX_DISTANCE_FROM_CURSOR, cursor.length - depth!)
  ) : 0

  const isCursorParent = distance === 2
    // grandparent
    // @ts-ignore
    ? equalPath(rootedContextOf(contextOf(cursor || [])), chain(state, contextChain, simplePath)) && getThoughtsRanked(state, cursor).length === 0
    // parent
    : equalPath(contextOf(cursor || []), chain(state, contextChain, simplePath))

  let contextBinding // eslint-disable-line fp/no-let
  try {
    contextBinding = JSON.parse(attribute(state, simplePathLive, '=bindContext') || '')
  }
  catch (err) {
    // eslint-disable-line no-empty
  }

  const isCursorGrandparent =
    equalPath(rootedContextOf(contextOf(cursor || [])), chain(state, contextChain, simplePath))
  const children = childrenForced || getThoughtsRanked(state, contextBinding || simplePathLive)

  const value = headValue(simplePathLive)

  // link URL
  const url = isURL(value) ? value :
  // if the only subthought is a url and the thought is not expanded, link the thought
    !expanded && children.length === 1 && children[0].value && isURL(children[0].value) && (!cursor || !equalPath(simplePathLive, contextOf(cursor))) ? children[0].value :
    null

  const thought = getThought(state, value)

  return {
    contextBinding,
    cursorOffset,
    distance,
    isPublishChild: !search && publishMode() && simplePath.length === 2,
    isCursorParent,
    isCursorGrandparent,
    expanded: expanded[hashContext(pathToContext(path))],
    expandedContextThought,
    isEditing,
    isEditingPath,
    publish: !search && publishMode(),
    thought,
    simplePathLive,
    view: attribute(state, simplePathLive, '=view'),
    url,
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
const mapDispatchToProps = (dispatch: Dispatch<Action | ActionCreator>) => ({
  toggleTopControlsAndBreadcrumbs: () => dispatch(toggleTopControlsAndBreadcrumbs(false)),
  setCursorOnNote: ({ path, contextChain }: { path: Path, contextChain: SimplePath[] }) => () => dispatch({
    type: 'setCursor',
    path,
    contextChain,
    cursorHistoryClear: true,
    editing: true,
    noteFocus: true
  } as Action),
})

/**********************************************************************
 * Drag and Drop
 **********************************************************************/

// eslint-disable-next-line jsdoc/require-jsdoc
const canDrag = (props: ThoughtContainerProps) => {
  const state = store.getState()
  const thoughts = pathToContext(props.simplePathLive!)
  const context = contextOf(pathToContext(props.simplePathLive!))
  const isDraggable = props.isDraggable || props.isCursorParent

  return isDocumentEditable() &&
    isDraggable &&
    (!isMobile || globals.touched) &&
    !hasChild(state, thoughts, '=immovable') &&
    !hasChild(state, thoughts, '=readonly') &&
    !hasChild(state, context, '=immovable') &&
    !hasChild(state, context, '=readonly')
}

// eslint-disable-next-line jsdoc/require-jsdoc
const beginDrag = ({ simplePathLive }: { simplePathLive: SimplePath }) => {
  store.dispatch({
    type: 'dragInProgress',
    value: true,
    draggingThought: simplePathLive,
    offset: document.getSelection()?.focusOffset,
  })
  return { simplePath: simplePathLive }
}

// eslint-disable-next-line jsdoc/require-jsdoc
const endDrag = () => {
  store.dispatch({ type: 'dragInProgress', value: false })
  store.dispatch({ type: 'dragHold', value: false })
  store.dispatch(alert(null))
}

// eslint-disable-next-line jsdoc/require-jsdoc
const dragCollect = (connect: DragSourceConnector, monitor: DragSourceMonitor) => ({
  dragSource: connect.dragSource(),
  dragPreview: connect.dragPreview(),
  isDragging: monitor.isDragging()
})

// eslint-disable-next-line jsdoc/require-jsdoc
const canDrop = (props: ThoughtContainerProps, monitor: DropTargetMonitor) => {

  const state = store.getState()
  const { cursor } = state
  const { simplePath: thoughtsFrom } = monitor.getItem()
  const thoughtsTo = props.simplePathLive!
  const thoughts = pathToContext(props.simplePathLive!)
  const context = contextOf(thoughts)
  const isSorted = getSortPreference(state, context).includes('Alphabetical')
  const distance = cursor ? cursor.length - thoughtsTo.length : 0
  const isHidden = distance >= 2
  const isSelf = equalPath(thoughtsTo, thoughtsFrom)
  const isDescendant = subsetThoughts(thoughtsTo, thoughtsFrom) && !isSelf
  const oldContext = rootedContextOf(thoughtsFrom)
  const newContext = rootedContextOf(thoughtsTo)
  const sameContext = equalArrays(oldContext, newContext)

  // do not drop on descendants (exclusive) or thoughts hidden by autofocus
  // allow drop on itself or after itself even though it is a noop so that drop-hover appears consistently
  return !isHidden && !isDescendant && (!isSorted || !sameContext)
}

// eslint-disable-next-line jsdoc/require-jsdoc
const drop = (props: ThoughtContainerProps, monitor: DropTargetMonitor) => {

  // no bubbling
  if (monitor.didDrop() || !monitor.isOver({ shallow: true })) return

  const state = store.getState()

  const { simplePath: thoughtsFrom } = monitor.getItem()
  const thoughtsTo = props.simplePathLive!
  const isRootOrEM = isRoot(thoughtsFrom) || isEM(thoughtsFrom)
  const oldContext = rootedContextOf(thoughtsFrom)
  const newContext = rootedContextOf(thoughtsTo)
  const sameContext = equalArrays(oldContext, newContext)

  // cannot move root or em context
  if (isRootOrEM && !sameContext) {
    store.dispatch({ type: 'error', value: `Cannot move the ${isRoot(thoughtsFrom) ? 'home' : 'em'} context to another context.` })
    return
  }

  // drop on itself or after itself is a noop
  if (equalPath(thoughtsFrom, thoughtsTo) || isBefore(state, thoughtsFrom, thoughtsTo)) return

  const newPath = unroot(contextOf(thoughtsTo)).concat({
    value: headValue(thoughtsFrom),
    rank: getRankBefore(state, thoughtsTo)
  })

  store.dispatch(props.showContexts
    ? {
      type: 'newThoughtSubmit',
      value: headValue(thoughtsTo),
      context: pathToContext(thoughtsFrom),
      rank: getNextRank(state, thoughtsFrom)
    }
    : {
      type: 'existingThoughtMove',
      oldPath: thoughtsFrom,
      newPath
    }
  )

  // alert user of move to another context
  if (!sameContext) {

    // wait until after MultiGesture has cleared the error so this alert does not get cleared
    setTimeout(() => {
      const alertFrom = '"' + ellipsize(headValue(thoughtsFrom)) + '"'
      const alertTo = isRoot(newContext)
        ? 'home'
        : '"' + ellipsize(headValue(contextOf(thoughtsTo))) + '"'

      store.dispatch(alert(`${alertFrom} moved to ${alertTo} context.`))
      clearTimeout(globals.errorTimer)
      // @ts-ignore
      globals.errorTimer = window.setTimeout(() => store.dispatch(alert(null)), 5000)
    }, 100)
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
const dropCollect = (connect: DropTargetConnector, monitor: DropTargetMonitor) => ({
  dropTarget: connect.dropTarget(),
  isHovering: monitor.isOver({ shallow: true }) && monitor.canDrop(),
  isDeepHovering: monitor.isOver()
})

/**********************************************************************
 * Components
 **********************************************************************/

/** A single thought element with overlay bullet, context breadcrumbs, editable, and superscript. */
const Thought = ({
  contextChain,
  cursorOffset,
  homeContext,
  isDragging,
  isEditing,
  isLeaf,
  hideBullet,
  path,
  publish,
  rank,
  showContextBreadcrumbs,
  showContexts,
  style,
  simplePath,
  toggleTopControlsAndBreadcrumbs
}: ThoughtProps & Pick<ReturnType<typeof mapDispatchToProps>, 'toggleTopControlsAndBreadcrumbs'>) => {
  const isRoot = simplePath.length === 1
  const isRootChildLeaf = simplePath.length === 2 && isLeaf

  return <div className='thought' style={homeContext ? { height: '1em', marginLeft: 8 } : {}}>

    {!(publish && (isRoot || isRootChildLeaf)) && !hideBullet && <BulletCursorOverlay simplePath={simplePath} isDragging={isDragging}/>}

    {showContextBreadcrumbs ? <ContextBreadcrumbs simplePath={contextOf(contextOf(simplePath))} showContexts={showContexts} />
    : showContexts && simplePath.length > 2 ? <span className='ellipsis'><a tabIndex={-1}/* TODO: Add setting to enable tabIndex for accessibility */ onClick={() => {
      store.dispatch(expandContextThought(path))
    }}>... </a></span>
    : null}

    {homeContext ? <HomeLink />
    : isDivider(headValue(simplePath)) ? <Divider path={simplePath} />
    // cannot use simplePathLive here else Editable gets re-rendered during editing
    : <Editable
      contextChain={contextChain}
      cursorOffset={cursorOffset}
      disabled={!isDocumentEditable()}
      isEditing={isEditing}
      rank={rank}
      showContexts={showContexts}
      style={style}
      simplePath={simplePath}
      onKeyDownAction={isMobile ? undefined : toggleTopControlsAndBreadcrumbs}
    />}

    <Superscript simplePath={simplePath} showContexts={showContexts} contextChain={contextChain} superscript={false} />
  </div>
}

/** A thought container with bullet, thought annotation, thought, and subthoughts.
 *
  @param allowSingleContext  Pass through to Subthoughts since the SearchSubthoughts component does not have direct access to the Subthoughts of the Subthoughts of the search. Default: false.
 */
const ThoughtContainer = ({
  allowSingleContext,
  childrenForced,
  contextBinding,
  contextChain,
  count = 0,
  cursor = [],
  cursorOffset,
  depth = 0,
  dragPreview,
  dragSource,
  dropTarget,
  expanded,
  expandedContextThought,
  hideBullet,
  isDeepHovering,
  isPublishChild,
  isCursorGrandparent,
  isCursorParent,
  isDraggable,
  isDragging,
  isEditing,
  isEditingPath,
  isHovering,
  isParentHovering,
  prevChild,
  publish,
  rank,
  setCursorOnNote,
  showContexts,
  style,
  thought,
  simplePath,
  simplePathLive,
  url,
  view,
  toggleTopControlsAndBreadcrumbs
}: ThoughtContainerProps & {
  dragPreview: ConnectDragPreview,
  dragSource: ConnectDragSource,
  dropTarget: ConnectDropTarget,
} & ReturnType<typeof mapDispatchToProps>) => {

  const state = store.getState()
  useEffect(() => {
    if (isHovering) {
      store.dispatch({
        type: 'dragInProgress',
        value: true,
        draggingThought: state.draggingThought,
        hoveringThought: [...context]
      })
    }
  }, [isHovering])

  /** Highlight bullet and show alert on long press on Thought. */
  const onLongPressStart = () => {
    if (!store.getState().dragHold) {
      store.dispatch({ type: 'dragHold', value: true, simplePath: simplePathLive })
      store.dispatch(alert('Drag and drop to move thought', { showCloseLink: false }))
    }
  }

  /** Cancel highlighting of bullet and dismiss alert when long press finished. */
  const onLongPressEnd = () => {
    if (store.getState().dragHold) {
      store.dispatch({ type: 'dragHold', value: false })
      store.dispatch(alert(null))
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const longPressHandlerProps = useLongPress(onLongPressStart, onLongPressEnd, TIMEOUT_BEFORE_DRAG)

  // resolve thoughts that are part of a context chain (i.e. some parts of thoughts expanded in context view) to match against cursor subset
  const path = contextChain && contextChain.length > 0
    ? chain(state, contextChain, simplePath)
    : unroot(simplePath)

  const value = headValue(simplePathLive!)

  // if rendering as a context and the thought is the root, render home icon instead of Editable
  const homeContext = showContexts && isRoot([head(contextOf(simplePath))])

  // prevent fading out cursor parent
  // there is a special case here for the cursor grandparent when the cursor is a leaf
  // See: <Subthoughts> render

  const children = childrenForced || getThoughtsRanked(state, contextBinding ? pathToContext(contextBinding) : simplePathLive!)

  // in the Context View, perform a data integrity check to confirm that the thought is in thoughtIndex
  const contextThought = showContexts && getThought(state, headValue(contextOf(simplePath)))

  const showContextBreadcrumbs = showContexts &&
    (!globals.ellipsizeContextThoughts || equalPath(path, expandedContextThought as Path | null)) &&
    simplePath.length > 2

  const thoughts = pathToContext(simplePath)
  const thoughtsLive = pathToContext(simplePathLive!)
  const context = contextOf(thoughts)
  const childrenOptions = getThoughts(state, [...context, 'Options'])
  const options = !isFunction(value) && childrenOptions.length > 0 ?
    childrenOptions.map(child => child.value.toLowerCase())
    : null

  const isLeaf = !hasChildren(state, thoughtsLive)

  const styleContainer = getStyle(state, thoughts, { container: true })
  const styleContainerZoom = isEditingPath ? getStyle(state, thoughts.concat('=focus', 'Zoom'), { container: true }) : null

  const cursorOnAlphabeticalSort = cursor && attributeEquals(state, context, '=sort', 'Alphabetical')

  const draggingThoughtValue = state.draggingThought
    ? head(pathToContext(state.draggingThought))
    : null

  // check if hovering thought context matches current thought
  const isAnyChildHovering = isDeepHovering && !isHovering && state.hoveringThought
    && thoughts.length === state.hoveringThought.length
    && state.hoveringThought.every((thought: string, index: number) => thought === thoughts[index])

  const shouldDisplayHover = cursorOnAlphabeticalSort
    // if alphabetical sort is enabled check if drag is in progress and parent element is hovering
    ? state.dragInProgress && isParentHovering && draggingThoughtValue
      // check if it's alphabetically previous to current thought
      && draggingThoughtValue <= value
      // check if it's alphabetically next to previous thought if it exists
      && (!prevChild || draggingThoughtValue > (prevChild as Child).value)
    // if alphabetical sort is disabled just check if current thought is hovering
    : globals.simulateDropHover || isHovering

  return thought ? dropTarget(dragSource(<li style={{
    ...styleContainer,
    ...styleContainerZoom,
  }} className={classNames({
    child: true,
    'child-divider': isDivider(thought!.value ?? ''),
    'cursor-parent': isCursorParent,
    'cursor-grandparent': isCursorGrandparent,
    // used so that the autofocus can properly highlight the immediate parent of the cursor
    editing: isEditing,
    expanded,
    'function': isFunction(value), // eslint-disable-line quote-props
    'has-only-child': children.length === 1,
    'invalid-option': options ? !options.includes(value.toLowerCase()) : null,
    // if editing and expansion is suppressed, mark as a leaf so that bullet does not show expanded
    // this is a bit of a hack since the bullet transform checks leaf instead of expanded
    // TODO: Consolidate with isLeaf if possible
    leaf: isLeaf || (isEditing && globals.suppressExpansion),
    // prose view will automatically be enabled if there enough characters in at least one of the thoughts within a context
    prose: view === 'Prose',
    // must use isContextViewActive to read from live state rather than showContexts which is a static propr from the Subthoughts component. showContext is not updated when the context view is toggled, since the Thought should not be re-rendered.
    'show-contexts': showContexts,
    'table-view': view === 'Table' && !isContextViewActive(state, pathToContext(path)),
  })} ref={el => {
    if (el) {
      dragPreview(getEmptyImage())
    }
  }}
    // disable to test if this solves the app switch touch issue on mobile PWA
    // { ...longPressHandlerProps }
  >
    <div className='thought-container' style={hideBullet ? { marginLeft: -12 } : {}}>

      {!(publish && context.length === 0) && (!isLeaf || !isPublishChild) && !hideBullet && <Bullet isEditing={isEditing} path={path} leaf={isLeaf} glyph={showContexts && !contextThought ? '✕' : null} onClick={(e: React.MouseEvent) => {
        if (!isEditing || children.length === 0) {
          e.stopPropagation()
          store.dispatch({
            type: 'setCursor',
            thoughtsRanked: simplePath,
          })
        }
      }}/>}

      <span className='drop-hover' style={{
        display: shouldDisplayHover ? 'inline' : 'none',
      }}></span>

      <ThoughtAnnotation
        contextChain={contextChain}
        homeContext={homeContext}
        minContexts={allowSingleContext ? 0 : 2}
        showContextBreadcrumbs={showContextBreadcrumbs}
        showContexts={showContexts}
        style={style}
        thoughtsRanked={simplePath}
        url={url}
      />

      <Thought
        contextChain={contextChain}
        cursorOffset={cursorOffset}
        hideBullet={hideBullet}
        homeContext={homeContext}
        isDraggable={isDraggable}
        isDragging={isDragging}
        isPublishChild={isPublishChild}
        isEditing={isEditing}
        isLeaf={isLeaf}
        path={path}
        publish={publish}
        rank={rank}
        showContextBreadcrumbs={showContextBreadcrumbs}
        showContexts={showContexts}
        style={style}
        simplePath={simplePath}
        toggleTopControlsAndBreadcrumbs={toggleTopControlsAndBreadcrumbs}
        view={view}
      />

      <Note
        context={thoughtsLive}
        onFocus={setCursorOnNote({ path, contextChain })}
      />

    </div>

    {publish && context.length === 0 && <Byline context={thoughts} />}

    { /* Recursive Subthoughts */}
    <Subthoughts
      allowSingleContext={allowSingleContext}
      childrenForced={childrenForced}
      contextChain={contextChain}
      count={count}
      depth={depth}
      isParentHovering={isAnyChildHovering}
      showContexts={allowSingleContext}
      simplePath={simplePath}
      sort={attribute(store.getState(), simplePathLive!, '=sort') || 'None'}
    />
  </li>)) : null
}

ThoughtContainer.displayName = 'ThoughtContainer'

// export connected, drag and drop higher order thought component
// @ts-ignore
const ThoughtComponent = connect(mapStateToProps, mapDispatchToProps)(DragSource('thought', { canDrag, beginDrag, endDrag }, dragCollect)(DropTarget('thought', { canDrop, drop }, dropCollect)(ThoughtContainer)))

export default ThoughtComponent
