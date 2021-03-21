import { hashThought } from '../../util'
import { DetaProvider } from '../DetaProvider'

/** Gets the Lexeme object of a value. */
const getThought = async (provider: DetaProvider, value: string) =>
  provider.getThoughtById(hashThought(value))

export default getThought
