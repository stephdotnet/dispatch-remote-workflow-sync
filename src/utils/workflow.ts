import { ActionConfig, ActionOutputs } from './config'
import {
  WorkflowRunConclusion,
  getWorkflowRunJobSteps,
  getWorkflowRunUrl,
  getWorkflowRunIds,
  retryOrDie,
  getWorkflowRunActiveJobUrlRetry,
  getWorkflowId as getWorkflowIdApi,
  retryOnError,
  getWorkflowRunState,
  WorkflowRunStatus,
  getWorkflowRunFailedJobs
} from './api'
import * as core from '@actions/core'

const WORKFLOW_FETCH_TIMEOUT_MS = 60 * 1000
const WORKFLOW_JOB_STEPS_RETRY_MS = 5000

export async function getWorkflowId(config: ActionConfig): Promise<number> {
  if (typeof config.workflow === 'string') {
    core.info(`Fetching Workflow ID for ${config.workflow}...`)
    return await getWorkflowIdApi(config.workflow)
  }

  return config.workflow
}

export async function getWorkflowRunId(
  config: ActionConfig,
  workflowId: number,
  DISTINCT_ID: string
): Promise<number | undefined> {
  const startTime = Date.now()
  const timeoutMs = config.workflowTimeoutSeconds * 1000
  let attemptNo = 0
  let elapsedTime = Date.now() - startTime

  core.info('Attempt to extract run ID from steps...')
  while (elapsedTime < timeoutMs) {
    attemptNo++
    elapsedTime = Date.now() - startTime

    core.debug(`Attempting to fetch Run IDs for Workflow ID ${workflowId}`)

    // Get all runs for a given workflow ID
    const workflowRunIds = await retryOrDie(
      async () => getWorkflowRunIds(workflowId),
      WORKFLOW_FETCH_TIMEOUT_MS > timeoutMs
        ? timeoutMs
        : WORKFLOW_FETCH_TIMEOUT_MS
    )

    core.debug(`Attempting to get step names for Run IDs: [${workflowRunIds}]`)

    const idRegex = new RegExp(DISTINCT_ID)

    /**
     * Attempt to read the distinct ID in the steps
     * for each existing run ID.
     */
    for (const id of workflowRunIds) {
      try {
        const steps = await getWorkflowRunJobSteps(id)
        for (const step of steps) {
          if (idRegex.test(step)) {
            core.debug('Testing: ' + idRegex)
            const url = await getWorkflowRunUrl(id)
            core.info(
              'Successfully identified remote Run:\n' +
                `  Run ID: ${id}\n` +
                `  URL: ${url}`
            )
            core.setOutput(ActionOutputs.runId, id)
            return id
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message !== 'Not Found') {
          throw error
        }
        core.debug(`Could not identify ID in run: ${id}, continuing...`)
      }
    }

    core.info(`Exhausted searching IDs in known runs, attempt ${attemptNo}...`)

    await new Promise(resolve =>
      setTimeout(resolve, WORKFLOW_JOB_STEPS_RETRY_MS)
    )
  }

  // Set outputs for other workflow steps to use
  core.setOutput('time', new Date().toTimeString())
}

export async function waitWorkflowRunFinish(
  config: ActionConfig,
  runId: number
): Promise<boolean> {
  const startTime = Date.now()

  const timeoutMs = config.workflowTimeoutSeconds * 1000
  let attemptNo = 0
  let elapsedTime = Date.now() - startTime

  core.info(
    `Awaiting completion of Workflow Run ${runId}...\n` +
      `  ID: ${runId}\n` +
      `  URL: ${await getWorkflowRunActiveJobUrlRetry(runId, 1000)}`
  )

  while (elapsedTime < timeoutMs) {
    attemptNo++
    elapsedTime = Date.now() - startTime

    const { status, conclusion } = await retryOnError(
      async () => getWorkflowRunState(runId),
      'getWorkflowRunState',
      400
    )

    if (status === WorkflowRunStatus.Completed) {
      switch (conclusion) {
        case WorkflowRunConclusion.Success:
          core.info(
            'Run Completed:\n' +
              `  Run ID: ${runId}\n` +
              `  Status: ${status}\n` +
              `  Conclusion: ${conclusion}`
          )
          return true
        case WorkflowRunConclusion.ActionRequired:
        case WorkflowRunConclusion.Cancelled:
        case WorkflowRunConclusion.Failure:
        case WorkflowRunConclusion.Neutral:
        case WorkflowRunConclusion.Skipped:
        case WorkflowRunConclusion.TimedOut:
          core.error(`Run has failed with conclusion: ${conclusion}`)
          await logFailureDetails(runId)
          core.setFailed(conclusion)
          return false
        default:
          core.setFailed(`Unknown conclusion: ${conclusion}`)
          return false
      }
    }

    core.debug(`Run has not concluded, attempt ${attemptNo}...`)

    await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs))
  }

  throw new Error(`Timeout exceeded while awaiting completion of Run ${runId}`)
}

async function logFailureDetails(runId: number): Promise<void> {
  const failedJobs = await getWorkflowRunFailedJobs(runId)
  for (const failedJob of failedJobs) {
    const failedSteps = failedJob.steps
      .filter(step => step.conclusion !== 'success')
      .map(step => {
        return (
          `    ${step.number}: ${step.name}\n` +
          `      Status: ${step.status}\n` +
          `      Conclusion: ${step.conclusion}`
        )
      })
      .join('\n')
    core.error(
      `Job ${failedJob.name}:\n` +
        `  ID: ${failedJob.id}\n` +
        `  Status: ${failedJob.status}\n` +
        `  Conclusion: ${failedJob.conclusion}\n` +
        `  URL: ${failedJob.url}\n` +
        `  Steps (non-success):\n` +
        failedSteps
    )
  }
}
