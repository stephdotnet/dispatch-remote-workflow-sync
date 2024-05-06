# Dispatch remote workflow sync

[![GitHub Super-Linter](https://github.com/stephdotnet/dispatch-remote-workflow-sync/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/stephdotnet/dispatch-remote-workflow-sync/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/stephdotnet/dispatch-remote-workflow-sync/actions/workflows/check-dist.yml/badge.svg)](https://github.com/stephdotnet/dispatch-remote-workflow-sync/actions/workflows/check-dist.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

Created with:

- https://github.com/actions/typescript-action

Based on:

- https://github.com/Codex-/return-dispatch
- https://github.com/Codex-/await-remote-run

## Usage

Ensure you have configured your remote action correctly, see below for an
example.

### Dispatching Repository Action

```yaml
steps:
  - name: Dispatch an action and get the run ID
    uses: stephdotnet/dispatch-remote-workflow-sync@main
    id: dispatch-sync
    with:
      token: ${{ secrets.TOKEN }} # Note this is NOT GITHUB_TOKEN but a PAT
      ref: target_branch # or refs/heads/target_branch
      repo: repository-name
      owner: repository-owner
      workflow: automation-test.yml
      workflow_inputs: '{ "some_input": "value" }' # Optional
      workflow_timeout_seconds: 120 # Default: 300

  - name: Use the output run ID
    run: echo ${{steps.return_dispatch.outputs.run_id}}
```

### Receiving Repository Action

In the earliest possible stage for the Action, add the input into the name.

As every step needs a `uses` or `run`, simply `echo` the ID or similar to
satisfy this requirement.

```yaml
name: action-test
on:
  workflow_dispatch:
    inputs:
      distinct_id:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: echo distinct ID ${{ github.event.inputs.distinct_id }}
        run: echo ${{ github.event.inputs.distinct_id }}
```

## Token

To be able to use dispatch we need to use a token which has `repo` permissions.
`GITHUB_TOKEN` currently does not allow adding permissions for `repo` level
permissions currently so a Personal Access Token (PAT) must be used.

### Permissions Required

The permissions required for this action to function correctly are:

- `repo` scope
  - You may get away with simply having `repo:public_repo`
  - `repo` is definitely needed if the repository is private.
- `actions:read`
- `actions:write`

## Additional notes

See:

- https://github.com/Codex-/return-dispatch/blob/main/README.md
- https://github.com/Codex-/await-remote-run/blob/main/README.md

## Publishing a New Release

This project includes a helper script, [`script/release`](./script/release)
designed to streamline the process of tagging and pushing new releases for
GitHub Actions.

GitHub Actions allows users to select a specific version of the action to use,
based on release tags. This script simplifies this process by performing the
following steps:

1. **Retrieving the latest release tag:** The script starts by fetching the most
   recent release tag by looking at the local data available in your repository.
1. **Prompting for a new release tag:** The user is then prompted to enter a new
   release tag. To assist with this, the script displays the latest release tag
   and provides a regular expression to validate the format of the new tag.
1. **Tagging the new release:** Once a valid new tag is entered, the script tags
   the new release.
1. **Pushing the new tag to the remote:** Finally, the script pushes the new tag
   to the remote repository. From here, you will need to create a new release in
   GitHub and users can easily reference the new tag in their workflows.
