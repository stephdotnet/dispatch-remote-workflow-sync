import * as core from '@actions/core'
import * as main from '../src/main'
import * as UtilsConfig from '../src/utils/config'
import * as api from '../src/utils/api'
import * as workflow from '../src/utils/workflow'

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Mock the GitHub Actions core library
let getInputMock: jest.SpiedFunction<typeof core.getInput>
let setFailedMock: jest.SpiedFunction<typeof core.setFailed>

let getConfigMock: jest.SpiedFunction<typeof UtilsConfig.getConfig>
let apiInitMock: jest.SpiedFunction<typeof api.init>
let dispatchWorkflowMock: jest.SpiedFunction<typeof api.dispatchWorkflow>
let getWorkflowIdMock: jest.SpiedFunction<typeof workflow.getWorkflowId>
let getWorkflowRunIdMock: jest.SpiedFunction<typeof workflow.getWorkflowRunId>
let waitWorkflowRunFinishMock: jest.SpiedFunction<
  typeof workflow.waitWorkflowRunFinish
>

describe('action', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()

    getConfigMock = jest.spyOn(UtilsConfig, 'getConfig').mockImplementation()
    apiInitMock = jest.spyOn(api, 'init').mockImplementation()
    dispatchWorkflowMock = jest
      .spyOn(api, 'dispatchWorkflow')
      .mockImplementation()
    getWorkflowIdMock = jest
      .spyOn(workflow, 'getWorkflowId')
      .mockImplementation()
    getWorkflowRunIdMock = jest
      .spyOn(workflow, 'getWorkflowRunId')
      .mockImplementation()
    waitWorkflowRunFinishMock = jest
      .spyOn(workflow, 'waitWorkflowRunFinish')
      .mockImplementation()
  })

  it('does not call setFailed when workflowRunId returned', async () => {
    getWorkflowIdMock.mockImplementation(() => Promise.resolve(123456))
    getWorkflowRunIdMock.mockImplementation(() => Promise.resolve(123456))

    await main.run()
    expect(runMock).toHaveReturned()

    // Verify that all of the core library functions were called correctly
    expect(getConfigMock).toHaveBeenCalledTimes(1)

    expect(setFailedMock).not.toHaveBeenCalled()
    expect(apiInitMock).toHaveBeenCalled()

    expect(getWorkflowIdMock).toHaveBeenCalled()
  })

  it('calls setFailed when no workflowRunId returned', async () => {
    getWorkflowIdMock.mockImplementation(() => Promise.resolve(123456))
    getWorkflowRunIdMock.mockImplementation(() => Promise.resolve(undefined))

    await main.run()
    expect(runMock).toHaveReturned()

    expect(getConfigMock).toHaveBeenCalledTimes(1)

    expect(setFailedMock).toHaveBeenCalled()
    expect(apiInitMock).toHaveBeenCalled()

    expect(getWorkflowIdMock).toHaveBeenCalled()
  })

  it('calls setFailed when error Thrown', async () => {
    getWorkflowIdMock.mockImplementation(() => Promise.resolve(123456))
    getWorkflowRunIdMock.mockImplementation(() => {
      throw new Error()
    })

    await main.run()
    expect(runMock).toHaveReturned()

    expect(getConfigMock).toHaveBeenCalledTimes(1)

    expect(setFailedMock).toHaveBeenCalled()
    expect(apiInitMock).toHaveBeenCalled()

    expect(getWorkflowIdMock).toHaveBeenCalled()
  })
})
