import * as github from '@actions/github'
import * as core from '@actions/core'
import {
  dispatchWorkflow,
  getWorkflowId,
  getWorkflowRunActiveJobUrl,
  getWorkflowRunActiveJobUrlRetry,
  getWorkflowRunFailedJobs,
  getWorkflowRunIds,
  getWorkflowRunJobSteps,
  getWorkflowRunState,
  getWorkflowRunUrl,
  init,
  retryOnError,
  retryOrDie
} from '../src/utils/api'
import * as config from '../src/utils/config'
import { randomUUID } from 'crypto'
import configFactory from './factories/config.factory'

let getOctokitMock: jest.SpiedFunction<typeof github.getOctokit>
let getConfigMock: jest.SpiedFunction<typeof config.getConfig>

jest.mock('@actions/core')
jest.mock('@actions/github')

interface MockResponse {
  data: unknown
  status: number
}

async function* mockPageIterator<T, P>(
  apiMethod: (params: P) => T,
  params: P
): AsyncGenerator<T, void, unknown> {
  yield apiMethod(params)
}

type getOctokitType = ReturnType<typeof github.getOctokit>
type listWorkflowRunParams = Parameters<
  getOctokitType['rest']['actions']['listWorkflowRuns']
>[0]
type createWorkflowDispatchParams = Parameters<
  getOctokitType['rest']['actions']['createWorkflowDispatch']
>[0]

const mockOctokit = {
  rest: {
    actions: {
      createWorkflowDispatch: async (
        _req: createWorkflowDispatchParams
      ): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      },
      getWorkflowRun: async (): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      },
      listRepoWorkflows: async (): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      },
      listWorkflowRuns: async (
        _req: listWorkflowRunParams
      ): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      },
      downloadWorkflowRunLogs: async (): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      },
      listJobsForWorkflowRun: async (): Promise<MockResponse> => {
        throw new Error('Should be mocked')
      }
    }
  },
  paginate: {
    iterator: mockPageIterator
  }
}

describe('api', () => {
  beforeEach(() => {
    getOctokitMock = jest.spyOn(github, 'getOctokit')
    getConfigMock = jest
      .spyOn(config, 'getConfig')
      .mockImplementation(() => configFactory)

    jest
      .spyOn(github, 'getOctokit')
      .mockReturnValue(
        mockOctokit as unknown as ReturnType<typeof github.getOctokit>
      )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('init', () => {
    it('gets config and inits octokit with token', () => {
      init()

      expect(getConfigMock).toHaveBeenCalled()
      expect(getOctokitMock).toHaveBeenCalled()
    })
  })

  describe('dispatchWorkflow', () => {
    it('should resolve after a successful dispatch', async () => {
      const createWorkflowDispatchMock = jest
        .spyOn(mockOctokit.rest.actions, 'createWorkflowDispatch')
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: 204
          })
        )

      await dispatchWorkflow('')
      expect(createWorkflowDispatchMock).toHaveBeenCalled()
    })

    it('should throw if a non-204 status is returned', async () => {
      const errorStatus = 401
      jest
        .spyOn(mockOctokit.rest.actions, 'createWorkflowDispatch')
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus
          })
        )

      await expect(dispatchWorkflow('')).rejects.toThrow(
        `Failed to dispatch action, expected 204 but received ${errorStatus}`
      )
    })

    it('should dispatch with a distinctId in the inputs', async () => {
      const distinctId = randomUUID()
      let dispatchedId: string | undefined
      jest
        .spyOn(mockOctokit.rest.actions, 'createWorkflowDispatch')
        .mockImplementation(async req => {
          dispatchedId = req?.inputs?.distinct_id as string

          return {
            data: undefined,
            status: 204
          }
        })

      await dispatchWorkflow(distinctId)
      expect(dispatchedId).toStrictEqual(distinctId)
    })
  })

  describe('getWorkflowId', () => {
    it('should return the workflow ID for a given workflow filename', async () => {
      const mockData = [
        {
          id: 0,
          path: '.github/workflows/cake.yml'
        },
        {
          id: 1,
          path: '.github/workflows/pie.yml'
        },
        {
          id: 2,
          path: '.github/workflows/slice.yml'
        }
      ]
      jest.spyOn(mockOctokit.rest.actions, 'listRepoWorkflows').mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200
        })
      )

      expect(await getWorkflowId('slice.yml')).toStrictEqual(mockData[2].id)
    })

    it('should throw if a non-200 status is returned', async () => {
      const errorStatus = 401
      jest.spyOn(mockOctokit.rest.actions, 'listRepoWorkflows').mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus
        })
      )

      await expect(getWorkflowId('implode')).rejects.toThrow(
        `Failed to get workflows, expected 200 but received ${errorStatus}`
      )
    })

    it('should throw if a given workflow name cannot be found in the response', async () => {
      const workflowName = 'slice'
      jest.spyOn(mockOctokit.rest.actions, 'listRepoWorkflows').mockReturnValue(
        Promise.resolve({
          data: [],
          status: 200
        })
      )

      await expect(getWorkflowId(workflowName)).rejects.toThrow(
        `Unable to find ID for Workflow: ${workflowName}`
      )
    })
  })

  describe('getWorkflowRunIds', () => {
    beforeEach(() => {
      init(configFactory)
    })

    it('should get the run IDs for a given workflow ID', async () => {
      const mockData = {
        total_count: 3,
        workflow_runs: [{ id: 0 }, { id: 1 }, { id: 2 }]
      }
      jest.spyOn(mockOctokit.rest.actions, 'listWorkflowRuns').mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200
        })
      )

      expect(await getWorkflowRunIds(0)).toStrictEqual(
        mockData.workflow_runs.map(run => run.id)
      )
    })

    it('should throw if a non-200 status is returned', async () => {
      const errorStatus = 401
      jest.spyOn(mockOctokit.rest.actions, 'listWorkflowRuns').mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus
        })
      )

      await expect(getWorkflowRunIds(0)).rejects.toThrow(
        `Failed to get Workflow runs, expected 200 but received ${errorStatus}`
      )
    })

    it('should return an empty array if there are no runs', async () => {
      const mockData = {
        total_count: 0,
        workflow_runs: []
      }
      jest.spyOn(mockOctokit.rest.actions, 'listWorkflowRuns').mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200
        })
      )

      expect(await getWorkflowRunIds(0)).toStrictEqual([])
    })

    it('should filter by branch name', async () => {
      configFactory.ref = '/refs/heads/master'
      let parsedRef: string | undefined

      jest
        .spyOn(mockOctokit.rest.actions, 'listWorkflowRuns')
        .mockImplementation(async req => {
          parsedRef = req?.branch
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: []
            },
            status: 200
          }
          return mockResponse
        })

      await getWorkflowRunIds(0)
      expect(parsedRef).toStrictEqual('master')
    })
  })

  describe('getWorkflowRunJobSteps', () => {
    it('should get the step names for a given Workflow Run ID', async () => {
      const mockData = {
        total_count: 1,
        jobs: [
          {
            id: 0,
            steps: [
              {
                name: 'Test Step 1',
                number: 1
              },
              {
                name: 'Test Step 2',
                number: 2
              }
            ]
          }
        ]
      }
      jest
        .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200
          })
        )

      expect(await getWorkflowRunJobSteps(0)).toStrictEqual([
        'Test Step 1',
        'Test Step 2'
      ])
    })

    it('should throw if a non-200 status is returned', async () => {
      const errorStatus = 401
      jest
        .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus
          })
        )

      await expect(getWorkflowRunJobSteps(0)).rejects.toThrow(
        `Failed to get Workflow Run Jobs, expected 200 but received ${errorStatus}`
      )
    })

    it('should return an empty array if there are no steps', async () => {
      const mockData = {
        total_count: 1,
        jobs: [
          {
            id: 0,
            steps: undefined
          }
        ]
      }
      jest
        .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
        .mockReturnValue(
          Promise.resolve({
            data: mockData,
            status: 200
          })
        )

      expect(await getWorkflowRunJobSteps(0)).toStrictEqual([])
    })
  })

  describe('getWorkflowRunUrl', () => {
    it('should return the workflow run state for a given run ID', async () => {
      const mockData = {
        html_url: 'master sword'
      }
      jest.spyOn(mockOctokit.rest.actions, 'getWorkflowRun').mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200
        })
      )

      const url = await getWorkflowRunUrl(123456)
      expect(url).toStrictEqual(mockData.html_url)
    })

    it('should throw if a non-200 status is returned', async () => {
      const errorStatus = 401
      jest.spyOn(mockOctokit.rest.actions, 'getWorkflowRun').mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus
        })
      )

      await expect(getWorkflowRunUrl(0)).rejects.toThrow(
        `Failed to get Workflow Run state, expected 200 but received ${errorStatus}`
      )
    })
  })

  describe('retryOrDie', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should return a populated array', async () => {
      const attempt = async (): Promise<number[]> => {
        return [0]
      }

      expect(await retryOrDie(attempt, 1000)).toHaveLength(1)
    })

    it('should throw if the given timeout is exceeded', async () => {
      // Never return data.
      const attempt = async (): Promise<[]> => []

      const retryOrDiePromise = retryOrDie(attempt, 1000)
      jest.advanceTimersByTime(2000)
      jest.advanceTimersByTimeAsync(2000)

      await expect(retryOrDiePromise).rejects.toThrow(
        'Timed out while attempting to fetch data'
      )
    })

    it('should retry to get a populated array', async () => {
      const attempt = jest
        .fn()
        .mockResolvedValue([0])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const retryOrDiePromise = retryOrDie(attempt, 5000)
      jest.advanceTimersByTime(3000)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      jest.advanceTimersByTimeAsync(3000)

      expect(await retryOrDiePromise).toHaveLength(1)
      expect(attempt).toHaveBeenCalledTimes(3)
    })
  })

  describe('getWorkflowRunState', () => {
    it('should return the workflow run state for a given run ID', async () => {
      const mockData = {
        status: 'completed',
        conclusion: 'cancelled'
      }
      jest.spyOn(mockOctokit.rest.actions, 'getWorkflowRun').mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200
        })
      )

      const state = await getWorkflowRunState(123456)
      expect(state.conclusion).toStrictEqual(mockData.conclusion)
      expect(state.status).toStrictEqual(mockData.status)
    })

    it('should throw if a non-200 status is returned', async () => {
      const errorStatus = 401
      jest.spyOn(mockOctokit.rest.actions, 'getWorkflowRun').mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus
        })
      )

      await expect(getWorkflowRunState(0)).rejects.toThrow(
        `Failed to get Workflow Run state, expected 200 but received ${errorStatus}`
      )
    })
  })

  describe('getWorkflowRunJobs', () => {
    const mockData = {
      total_count: 1,
      jobs: [
        {
          id: 123456789,
          html_url: 'https://github.com/codex-/await-remote-run/runs/123456789',
          status: 'completed',
          conclusion: 'failure',
          name: 'test-run',
          steps: [
            {
              name: 'Step 1',
              status: 'completed',
              conclusion: 'success',
              number: 1
            },
            {
              name: 'Step 2',
              status: 'completed',
              conclusion: 'failure',
              number: 6
            }
          ]
        }
      ]
    }

    describe('getWorkflowRunFailedJobs', () => {
      it('should return the jobs for a failed workflow run given a run ID', async () => {
        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: mockData,
              status: 200
            })
          )

        const jobs = await getWorkflowRunFailedJobs(123456)
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.id).toStrictEqual(mockData.jobs[0]?.id)
        expect(jobs[0]?.name).toStrictEqual(mockData.jobs[0]?.name)
        expect(jobs[0]?.status).toStrictEqual(mockData.jobs[0]?.status)
        expect(jobs[0]?.conclusion).toStrictEqual(mockData.jobs[0]?.conclusion)
        expect(jobs[0]?.url).toStrictEqual(mockData.jobs[0]?.html_url)
        expect(Array.isArray(jobs[0]?.steps)).toStrictEqual(true)
      })

      it('should throw if a non-200 status is returned', async () => {
        const errorStatus = 401
        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: undefined,
              status: errorStatus
            })
          )

        await expect(getWorkflowRunFailedJobs(0)).rejects.toThrow(
          `Failed to get Jobs for Workflow Run, expected 200 but received ${errorStatus}`
        )
      })

      it('should return the steps for a failed Job', async () => {
        const mockSteps = mockData.jobs[0].steps
        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: mockData,
              status: 200
            })
          )

        const { steps } = (await getWorkflowRunFailedJobs(123456))[0]
        expect(steps).toHaveLength(mockData.jobs[0].steps.length)
        for (let i = 0; i < mockSteps.length; i++) {
          expect(steps[i]?.name).toStrictEqual(mockSteps[i]?.name)
          expect(steps[i]?.number).toStrictEqual(mockSteps[i]?.number)
          expect(steps[i]?.status).toStrictEqual(mockSteps[i]?.status)
          expect(steps[i]?.conclusion).toStrictEqual(mockSteps[i]?.conclusion)
        }
      })
    })

    describe('getWorkflowRunActiveJobUrl', () => {
      let inProgressMockData: any
      beforeEach(() => {
        inProgressMockData = {
          ...mockData,
          jobs: [
            {
              ...mockData.jobs[0],
              status: 'in_progress',
              conclusion: null as string | null
            }
          ]
        }
      })

      it('should return the url for an in_progress workflow run given a run ID', async () => {
        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: inProgressMockData,
              status: 200
            })
          )

        const url = await getWorkflowRunActiveJobUrl(123456)
        expect(url).toStrictEqual(mockData.jobs[0]?.html_url)
      })

      it('should return the url for an completed workflow run given a run ID', async () => {
        inProgressMockData.jobs[0].status = 'completed'

        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: inProgressMockData,
              status: 200
            })
          )

        const url = await getWorkflowRunActiveJobUrl(123456)
        expect(url).toStrictEqual(mockData.jobs[0]?.html_url)
      })

      it('should throw if a non-200 status is returned', async () => {
        const errorStatus = 401
        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: undefined,
              status: errorStatus
            })
          )

        await expect(getWorkflowRunActiveJobUrl(0)).rejects.toThrow(
          `Failed to get Jobs for Workflow Run, expected 200 but received ${errorStatus}`
        )
      })

      it('should return undefined if no in_progress job is found', async () => {
        inProgressMockData.jobs[0].status = 'unknown'

        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: inProgressMockData,
              status: 200
            })
          )

        const url = await getWorkflowRunActiveJobUrl(123456)
        expect(url).toStrictEqual(undefined)
      })

      it('should return even if GitHub fails to return a URL', async () => {
        inProgressMockData.jobs[0].html_url = null

        jest
          .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
          .mockReturnValue(
            Promise.resolve({
              data: inProgressMockData,
              status: 200
            })
          )

        const url = await getWorkflowRunActiveJobUrl(123456)
        expect(url).toStrictEqual('GitHub failed to return the URL')
      })

      describe('getWorkflowRunActiveJobUrlRetry', () => {
        beforeEach(() => {
          jest.useFakeTimers()
        })

        afterEach(() => {
          jest.useRealTimers()
        })

        it('should return a message if no job is found', async () => {
          inProgressMockData.jobs[0].status = 'unknown'

          jest
            .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
            .mockReturnValue(
              Promise.resolve({
                data: inProgressMockData,
                status: 200
              })
            )

          const urlPromise = getWorkflowRunActiveJobUrlRetry(123456, 100)
          jest.advanceTimersByTime(400)
          await jest.advanceTimersByTimeAsync(400)

          const url = await urlPromise
          expect(url).toStrictEqual('Unable to fetch URL')
        })

        it('should return a message if no job is found within the timeout period', async () => {
          jest
            .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
            // Final
            .mockImplementation(async () => {
              inProgressMockData.jobs[0].status = 'in_progress'

              return Promise.resolve({
                data: inProgressMockData,
                status: 200
              })
            })
            // First
            .mockImplementationOnce(async () => {
              inProgressMockData.jobs[0].status = 'unknown'

              return Promise.resolve({
                data: inProgressMockData,
                status: 200
              })
            })
            // Second
            .mockImplementationOnce(async () =>
              Promise.resolve({
                data: inProgressMockData,
                status: 200
              })
            )

          const urlPromise = getWorkflowRunActiveJobUrlRetry(123456, 200)
          jest.advanceTimersByTime(400)
          await jest.advanceTimersByTimeAsync(400)

          const url = await urlPromise
          expect(url).toStrictEqual('Unable to fetch URL')
        })

        it('should return a URL if an in_progress job is found', async () => {
          jest
            .spyOn(mockOctokit.rest.actions, 'listJobsForWorkflowRun')
            .mockImplementation(async () =>
              Promise.resolve({
                data: inProgressMockData,
                status: 200
              })
            )

          const urlPromise = getWorkflowRunActiveJobUrlRetry(123456, 200)
          jest.advanceTimersByTime(400)
          await jest.advanceTimersByTimeAsync(400)

          const url = await urlPromise
          expect(url).toStrictEqual(inProgressMockData.jobs[0]?.html_url)
        })
      })
    })
  })

  describe('retryOnError', () => {
    let warningLogSpy: jest.SpiedFunction<typeof core.warning>

    beforeEach(() => {
      jest.useFakeTimers()
      warningLogSpy = jest.spyOn(core, 'warning')
    })

    afterEach(() => {
      jest.useRealTimers()
      warningLogSpy.mockRestore()
    })

    it('should retry a function if it throws an error', async () => {
      const funcName = 'testFunc'
      const errorMsg = 'some error'
      const testFunc = jest
        .fn()
        .mockImplementation(async () => 'completed')
        .mockImplementationOnce(async () => {
          throw new Error(errorMsg)
        })

      const retryPromise = retryOnError(() => testFunc(), funcName)

      // Progress timers to first failure
      jest.advanceTimersByTime(500)
      await jest.advanceTimersByTimeAsync(500)

      expect(warningLogSpy).toHaveBeenCalledTimes(1)
      expect(warningLogSpy).toHaveBeenCalledWith(
        'retryOnError: An unexpected error has occurred:\n' +
          `  name: ${funcName}\n` +
          `  error: ${errorMsg}`
      )

      // Progress timers to second success
      jest.advanceTimersByTime(500)
      await jest.advanceTimersByTimeAsync(500)
      const result = await retryPromise

      expect(warningLogSpy).toHaveBeenCalledTimes(1)
      expect(result).toStrictEqual('completed')
    })

    it('should throw the original error if timed out while calling the function', async () => {
      const funcName = 'testFunc'
      const errorMsg = 'some error'
      const testFunc = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        throw new Error(errorMsg)
      })

      const retryPromise = retryOnError(() => testFunc(), funcName, 500)

      jest.advanceTimersByTime(500)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      jest.advanceTimersByTimeAsync(500)

      await expect(retryPromise).rejects.toThrow('some error')
    })
  })
})
