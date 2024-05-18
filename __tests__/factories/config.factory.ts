const workflowInputs = {
  foo: 'bar'
}

export default {
  token: 'token',
  ref: 'main',
  repo: 'my-repo',
  owner: 'the-owner',
  workflow: 'workflow.yml',
  workflowInputs,
  workflowTimeoutSeconds: 60,
  pollIntervalMs: 60
}
