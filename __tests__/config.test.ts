import { ActionConfig, getConfig } from '../src/utils/config'
import * as core from '@actions/core'
import output from './factories/config.factory'

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.spyOn(core, 'error').mockImplementation()
    jest.spyOn(core, 'debug').mockImplementation()

    jest.spyOn(core, 'getInput').mockImplementation((input: string) => {
      switch (input) {
        case 'token':
          return inputs.token
        case 'ref':
          return inputs.ref
        case 'repo':
          return inputs.repo
        case 'owner':
          return inputs.owner
        case 'workflow':
          return inputs.workflow
        case 'workflow_inputs':
          return inputs.workflow_inputs
        case 'workflow_timeout_seconds':
          return inputs.workflow_timeout_seconds
        case 'poll_interval_ms':
          return inputs.poll_interval_ms
        default:
          throw new Error('invalid input requested')
      }
    })
  })

  it('should return a valid config', () => {
    const config: ActionConfig = getConfig()

    // Assert that the numbers / types have been properly loaded.
    expect(config.token).toStrictEqual(output.token)
    expect(config.ref).toStrictEqual(output.ref)
    expect(config.repo).toStrictEqual(output.repo)
    expect(config.owner).toStrictEqual(output.owner)
    expect(config.workflow).toStrictEqual(output.workflow)
    expect(config.workflowInputs).toStrictEqual(output.workflowInputs)
    expect(config.workflowTimeoutSeconds).toStrictEqual(60)
    expect(config.pollIntervalMs).toStrictEqual(60)
  })

  it('should have a number for a workflow when given a workflow ID', () => {
    inputs.workflow = '123456'
    const config: ActionConfig = getConfig()

    expect(config.workflow).toStrictEqual(123456)
  })

  it('should provide a default workflow timeout if none is supplied', () => {
    inputs.workflow_timeout_seconds = ''
    const config: ActionConfig = getConfig()

    expect(config.workflowTimeoutSeconds).toStrictEqual(300)
  })

  it('should handle no inputs being provided', () => {
    inputs.workflow_inputs = ''
    const config: ActionConfig = getConfig()

    expect(config.workflowInputs).toBeUndefined()
  })

  it('should throw if invalid workflow inputs JSON is provided', () => {
    inputs.workflow_inputs = '{'

    expect(() => getConfig()).toThrow()
  })

  it('should handle workflow inputs JSON containing strings numbers or booleans', () => {
    inputs.workflow_inputs = '{"cake":"delicious","pie":9001,"parfait":false}'

    expect(() => getConfig()).not.toThrow()
  })

  it("should throw if a workflow inputs JSON doesn't contain strings numbers or booleans", () => {
    inputs.workflow_inputs = '{"pie":{"powerLevel":9001}}'
    expect(() => getConfig()).toThrow('"pie" value is object')

    inputs.workflow_inputs = '{"vegetable":null}'
    expect(() => getConfig()).toThrow('"vegetable" value is null')

    inputs.workflow_inputs = '{"fruit":[]}'
    expect(() => getConfig()).toThrow('"fruit" value is Array')
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })
})

const inputs = {
  token: 'token',
  ref: 'main',
  repo: 'my-repo',
  owner: 'the-owner',
  workflow: 'workflow.yml',
  workflow_inputs: JSON.stringify(output.workflowInputs),
  workflow_timeout_seconds: '60',
  poll_interval_ms: '60'
}
