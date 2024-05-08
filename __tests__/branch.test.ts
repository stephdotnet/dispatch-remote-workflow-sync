import * as core from '@actions/core'
import { getBranchName } from '../src/utils/branch'

let debugMock: jest.SpiedFunction<typeof core.debug>

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.spyOn(core, 'error').mockImplementation()
    debugMock = jest.spyOn(core, 'debug').mockImplementation()
    jest.spyOn(core, 'debug').mockImplementation()
  })

  it('should return a valid branchName', () => {
    const branchName = getBranchName('refs/heads/main')
    expect(branchName).toEqual('main')
  })

  it('should return a input branchName when no refs', () => {
    const branchName = getBranchName('main')
    expect(branchName).toEqual('main')
    expect(debugMock).toHaveBeenCalled()
  })

  it('should return a input branchName when tags ref', () => {
    const branchName = getBranchName('refs/tags/test')
    expect(branchName).toEqual('refs/tags/test')
    expect(debugMock).toHaveBeenCalled()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
})
