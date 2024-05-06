/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as main from '../src/main'
import * as UtilsConfig from '../src/utils/config'
import * as api from '../src/utils/api'
import * as workflow from '../src/utils/workflow'

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Other utilities
const timeRegex = /^\d{2}:\d{2}:\d{2}/

// Mock the GitHub Actions core library
let getInputMock: jest.SpiedFunction<typeof core.getInput>
let setFailedMock: jest.SpiedFunction<typeof core.setFailed>

let getConfigMock: jest.SpiedFunction<typeof UtilsConfig.getConfig>
let apiInitMock: jest.SpiedFunction<typeof api.init>
let getWorkflowIdMock: jest.SpiedFunction<typeof workflow.getWorkflowId>
let getWorkflowRunIdMock: jest.SpiedFunction<typeof workflow.getWorkflowRunId>
let waitWorkflowRunFinishMock: jest.SpiedFunction<
  typeof workflow.waitWorkflowRunFinish
>

describe('action', () => {
  const workflowInputs = {
    cake: 'delicious'
  }

  let mockEnvConfig: any

  beforeEach(() => {
    jest.clearAllMocks()

    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()

    getConfigMock = jest.spyOn(UtilsConfig, 'getConfig')
    apiInitMock = jest.spyOn(api, 'init').mockImplementation()
    getWorkflowIdMock = jest
      .spyOn(workflow, 'getWorkflowId')
      .mockImplementation()
    getWorkflowRunIdMock = jest
      .spyOn(workflow, 'getWorkflowRunId')
      .mockImplementation()
    waitWorkflowRunFinishMock = jest
      .spyOn(workflow, 'waitWorkflowRunFinish')
      .mockImplementation()

    mockEnvConfig = {
      token: 'secret',
      ref: 'feature_branch',
      repo: 'repository',
      owner: 'owner',
      workflow: 'workflow_name',
      workflow_inputs: JSON.stringify(workflowInputs),
      workflow_timeout_seconds: '60'
    }
  })

  it('setFailed when no workflowRunId', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation((input: string) => {
      switch (input) {
        case 'token':
          return mockEnvConfig.token
        case 'ref':
          return mockEnvConfig.ref
        case 'repo':
          return mockEnvConfig.repo
        case 'owner':
          return mockEnvConfig.owner
        case 'workflow':
          return mockEnvConfig.workflow
        case 'workflow_inputs':
          return mockEnvConfig.workflow_inputs
        case 'workflow_timeout_seconds':
          return mockEnvConfig.workflow_timeout_seconds
        default:
          throw new Error('invalid input requested')
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    // Verify that all of the core library functions were called correctly
    expect(getConfigMock).toHaveBeenCalledTimes(1)
    expect(getConfigMock).toHaveReturnedWith(mockEnvConfig)

    expect(setFailedMock).not.toHaveBeenCalled()
    expect(apiInitMock).toHaveBeenCalledWith(mockEnvConfig)
    getWorkflowIdMock.mockImplementation(() => Promise.resolve(123456))

    expect(getWorkflowIdMock).toHaveBeenCalledWith(input => {
      console.log('getWorkflowIdMock input')
      console.log(input)
      return true
    })
  })
})
