import getFirebaseProvider from '../detaFirebase'
import DetaProviderTest from '../../test-helpers/DetaProviderTest'
import { store } from '../../store'

jest.useFakeTimers()

// mock getUserRef (firebase's database.ref)
jest.mock('../../util/getUserRef')
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      clearMockFirebaseStore: () => void,
    }
  }
}

afterEach(() => {
  global.clearMockFirebaseStore()
})

DetaProviderTest(getFirebaseProvider(store.getState(), store.dispatch))
