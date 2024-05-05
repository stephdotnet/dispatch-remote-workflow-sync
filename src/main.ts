import * as core from '@actions/core'
import { v4 as uuid } from 'uuid'
import { getConfig } from './utils/config'
import {
  getWorkflowId,
  getWorkflowRunId,
  waitWorkflowRunFinish
} from './utils/workflow'
import * as api from './utils/api'

const DISTINCT_ID = uuid()

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const config = getConfig()

    api.init(config)

    const workflowId = await getWorkflowId(config)

    // Dispatch the action
    await api.dispatchWorkflow(DISTINCT_ID)

    const workflowRunId = await getWorkflowRunId(
      config,
      workflowId,
      DISTINCT_ID
    )

    // Wait for workflowRun to finish
    if (workflowRunId) {
      await waitWorkflowRunFinish(config, workflowRunId)
    } else {
      core.setFailed('Did not receive workflowRunId')
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
