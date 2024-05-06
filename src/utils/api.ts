import * as core from '@actions/core'
import * as github from '@actions/github'
import { ActionConfig, getConfig } from './config'
import { getBranchName } from './branch'

type Octokit = ReturnType<(typeof github)['getOctokit']>

let config: ActionConfig
let octokit: Octokit

export enum WorkflowRunStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed'
}

export enum WorkflowRunConclusion {
  Success = 'success',
  Failure = 'failure',
  Neutral = 'neutral',
  Cancelled = 'cancelled',
  Skipped = 'skipped',
  TimedOut = 'timed_out',
  ActionRequired = 'action_required'
}

export interface WorkflowRunState {
  status: WorkflowRunStatus | null
  conclusion: WorkflowRunConclusion | null
}

export function init(cfg?: ActionConfig): void {
  config = cfg || getConfig()
  octokit = github.getOctokit(config.token)
}

export async function dispatchWorkflow(distinctId: string): Promise<void> {
  try {
    // https://docs.github.com/en/rest/reference/actions#create-a-workflow-dispatch-event
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: config.owner,
      repo: config.repo,
      workflow_id: config.workflow,
      ref: config.ref,
      inputs: {
        ...(config.workflowInputs ? config.workflowInputs : undefined),
        distinct_id: distinctId
      }
    })

    if (response.status !== 204) {
      throw new Error(
        `Failed to dispatch action, expected 204 but received ${response.status}`
      )
    }

    core.info(
      'Successfully dispatched workflow:\n' +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${config.ref}\n` +
        `  Workflow ID: ${config.workflow}\n` +
        (config.workflowInputs
          ? `  Workflow Inputs: ${JSON.stringify(config.workflowInputs)}\n`
          : ``) +
        `  Distinct ID: ${distinctId}`
    )
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `dispatchWorkflow: An unexpected error has occurred: ${error.message}`
      )
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowId(workflowFilename: string): Promise<number> {
  try {
    const sanitisedFilename = workflowFilename.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )

    // https://docs.github.com/en/rest/reference/actions#list-repository-workflows
    const workflowIterator = octokit.paginate.iterator(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner: config.owner,
        repo: config.repo
      }
    )
    let workflowId: number | undefined

    for await (const response of workflowIterator) {
      if (response.status !== 200) {
        throw new Error(
          `Failed to get workflows, expected 200 but received ${response.status}`
        )
      }
      // wrong type definition
      const workflows: typeof response.data.workflows = response.data

      workflowId = workflows.find(workflow =>
        new RegExp(sanitisedFilename).test(workflow.path)
      )?.id

      if (workflowId !== undefined) {
        break
      }
    }

    if (workflowId === undefined) {
      throw new Error(`Unable to find ID for Workflow: ${workflowFilename}`)
    }

    return workflowId
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowId: An unexpected error has occurred: ${error.message}`
      )
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowRunUrl(runId: number): Promise<string> {
  try {
    // https://docs.github.com/en/rest/reference/actions#get-a-workflow-run
    const response = await octokit.rest.actions.getWorkflowRun({
      owner: config.owner,
      repo: config.repo,
      run_id: runId
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run state, expected 200 but received ${response.status}`
      )
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  URL: ${response.data.html_url}`
    )

    return response.data.html_url
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunUrl: An unexpected error has occurred: ${error.message}`
      )
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowRunIds(workflowId: number): Promise<number[]> {
  try {
    const branchName = getBranchName(config.ref) || config.ref

    // https://docs.github.com/en/rest/reference/actions#list-workflow-runs
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: config.owner,
      repo: config.repo,
      workflow_id: workflowId,
      ...(branchName
        ? {
            branch: branchName,
            per_page: 5
          }
        : {
            per_page: 10
          })
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow runs, expected 200 but received ${response.status}`
      )
    }

    const runIds = response.data.workflow_runs.map(
      workflowRun => workflowRun.id
    )

    core.debug(
      'Fetched Workflow Runs:\n' +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Branch: ${branchName || 'undefined'}\n` +
        `  Workflow ID: ${workflowId}\n` +
        `  Runs Fetched: [${runIds}]`
    )

    return runIds
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunIds: An unexpected error has occurred: ${error.message}`
      )
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowRunJobSteps(runId: number): Promise<string[]> {
  try {
    // https://docs.github.com/en/rest/reference/actions#list-jobs-for-a-workflow-run
    const response = await octokit.rest.actions.listJobsForWorkflowRun({
      owner: config.owner,
      repo: config.repo,
      run_id: runId
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run Jobs, expected 200 but received ${response.status}`
      )
    }

    const jobs = response.data.jobs.map(job => ({
      id: job.id,
      steps: job.steps?.map(step => step.name) || []
    }))

    const steps = Array.from(new Set(jobs.flatMap(job => job.steps)))

    core.debug(
      'Fetched Workflow Run Job Steps:\n' +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Workflow Run ID: ${runId}\n` +
        `  Jobs Fetched: [${jobs.map(job => job.id)}]` +
        `  Steps Fetched: [${steps}]`
    )

    return steps
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunJobs: An unexpected error has occurred: ${error.message}`
      )
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

/**
 * Attempt to get a non-empty array from the API.
 */
export async function retryOrDie<T>(
  retryFunc: () => Promise<T[]>,
  timeoutMs: number
): Promise<T[]> {
  const startTime = Date.now()
  let elapsedTime = 0
  while (elapsedTime < timeoutMs) {
    elapsedTime = Date.now() - startTime

    const response = await retryFunc()
    if (response.length > 0) {
      return response
    }

    await new Promise<void>(resolve => setTimeout(resolve, 1000))
  }

  throw new Error('Timed out while attempting to fetch data')
}

export async function getWorkflowRunState(
  runId: number
): Promise<WorkflowRunState> {
  try {
    // https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
    const response = await octokit.rest.actions.getWorkflowRun({
      owner: config.owner,
      repo: config.repo,
      run_id: runId
    })

    if (response.status !== 200) {
      throw new Error(
        `Failed to get Workflow Run state, expected 200 but received ${response.status}`
      )
    }

    core.debug(
      `Fetched Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  Status: ${response.data.status}\n` +
        `  Conclusion: ${response.data.conclusion}`
    )

    return {
      status: response.data.status as WorkflowRunStatus | null,
      conclusion: response.data.conclusion as WorkflowRunConclusion | null
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunState: An unexpected error has occurred: ${error.message}`
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export interface WorkflowRunJob {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed' | 'waiting'
  conclusion: string | null
  steps: WorkflowRunJobStep[]
  url: string | null
}

export interface WorkflowRunJobStep {
  name: string
  status: string
  conclusion: string | null
  number: number
}

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T
type ListJobsForWorkflowRunResponse = Awaited<
  ReturnType<Octokit['rest']['actions']['listJobsForWorkflowRun']>
>

async function getWorkflowRunJobs(
  runId: number
): Promise<ListJobsForWorkflowRunResponse> {
  // https://docs.github.com/en/rest/reference/actions#list-jobs-for-a-workflow-run
  const response = await octokit.rest.actions.listJobsForWorkflowRun({
    owner: config.owner,
    repo: config.repo,
    run_id: runId,
    filter: 'latest'
  })

  if (response.status !== 200) {
    throw new Error(
      `Failed to get Jobs for Workflow Run, expected 200 but received ${response.status}`
    )
  }

  return response
}

export async function getWorkflowRunFailedJobs(
  runId: number
): Promise<WorkflowRunJob[]> {
  try {
    const response = await getWorkflowRunJobs(runId)
    const fetchedFailedJobs = response.data.jobs.filter(
      job => job.conclusion === 'failure'
    )

    if (fetchedFailedJobs.length <= 0) {
      core.warning(`Failed to find failed Jobs for Workflow Run ${runId}`)
      return []
    }

    const jobs: WorkflowRunJob[] = fetchedFailedJobs.map(job => {
      const steps = job.steps?.map(step => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number
      }))

      return {
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        steps: steps || [],
        url: job.html_url
      }
    })

    core.debug(
      `Fetched Jobs for Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  Jobs: [${jobs.map(job => job.name)}]`
    )

    for (const job of jobs) {
      const steps = job.steps.map(step => `${step.number}: ${step.name}`)
      core.debug(
        `  Job: ${job.name}\n` +
          `    ID: ${job.id}\n` +
          `    Status: ${job.status}\n` +
          `    Conclusion: ${job.conclusion}\n` +
          `    Steps: [${steps}]`
      )
    }

    return jobs
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunJobFailures: An unexpected error has occurred: ${error.message}`
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowRunActiveJobUrl(
  runId: number
): Promise<string | undefined> {
  try {
    const response = await getWorkflowRunJobs(runId)
    const fetchedInProgressJobs = response.data.jobs.filter(
      job => job.status === 'in_progress' || job.status === 'completed'
    )

    core.debug(
      `Fetched Jobs for Run:\n` +
        `  Repository: ${config.owner}/${config.repo}\n` +
        `  Run ID: ${runId}\n` +
        `  Jobs: [${fetchedInProgressJobs.map(
          job => `${job.name} (${job.status})`
        )}]`
    )

    if (fetchedInProgressJobs.length <= 0) {
      return undefined
    }

    return (
      fetchedInProgressJobs[0]?.html_url || 'GitHub failed to return the URL'
    )
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `getWorkflowRunActiveJobUrl: An unexpected error has occurred: ${error.message}`
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      error.stack && core.debug(error.stack)
    }
    throw error
  }
}

export async function getWorkflowRunActiveJobUrlRetry(
  runId: number,
  timeout: number
): Promise<string> {
  const startTime = Date.now()
  let elapsedTime = Date.now() - startTime

  while (elapsedTime < timeout) {
    elapsedTime = Date.now() - startTime
    core.debug(
      `No 'in_progress' or 'completed' Jobs found for Workflow Run ${runId}, retrying...`
    )

    const url = await getWorkflowRunActiveJobUrl(runId)
    if (url) {
      return url
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }
  core.debug(`Timed out while trying to fetch URL for Workflow Run ${runId}`)

  return 'Unable to fetch URL'
}

export async function retryOnError<T>(
  func: () => Promise<T>,
  name: string,
  timeout = 5000
): Promise<T> {
  const startTime = Date.now()
  let elapsedTime = Date.now() - startTime

  while (elapsedTime < timeout) {
    elapsedTime = Date.now() - startTime
    try {
      return await func()
    } catch (error) {
      if (error instanceof Error) {
        // We now exceed the time, so throw the error up
        if (Date.now() - startTime >= timeout) {
          throw error
        }

        core.warning(
          'retryOnError: An unexpected error has occurred:\n' +
            `  name: ${name}\n` +
            `  error: ${error.message}`
        )
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  throw new Error(`Timeout exceeded while attempting to retry ${name}`)
}
