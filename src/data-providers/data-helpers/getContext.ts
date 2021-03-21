import { Context } from '../../types'
import { hashContext } from '../../util'
import { DetaProvider } from '../DetaProvider'

/** Gets the Parent for a context. */
const getContext = async (provider: DetaProvider, context: Context) =>
  provider.getContextById(hashContext(context))

export default getContext
