import { setFailed, getInput, setOutput } from '@actions/core';
import github from '@actions/github';
import axios from 'axios';
import { assert } from 'assert-ts';

const waitForUrl = async ({
  url,
  maxTimeout,
  checkIntervalInMilliseconds,
}: {
  url: string;
  maxTimeout: number;
  checkIntervalInMilliseconds: number;
}) => {
  const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);
  for (let i = 0; i < iterations; i++) {
    try {
      await axios.get(url);
      return;
    } catch (e) {
      console.log('Url unavailable, retrying...');
      await new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
    }
  }
  setFailed(`Timeout reached: Unable to connect to ${url}`);
};

const waitForStatus = async ({
  token,
  owner,
  repo,
  deployment_id,
  maxTimeout,
  allowInactive,
  checkIntervalInMilliseconds,
}: {
  token: string;
  owner: string;
  repo: string;
  deployment_id: number;
  maxTimeout: number;
  allowInactive: boolean;
  checkIntervalInMilliseconds: number;
}) => {
  const octokit = github.getOctokit(token);
  const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);

  for (let i = 0; i < iterations; i++) {
    try {
      const statuses = await octokit.rest.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id,
      });

      const status = statuses.data.length > 0 && statuses.data[0];

      assert(!!status, 'No status was available');

      if (allowInactive === true && status.state === 'inactive') {
        return status;
      }

      assert(status.state === 'success', 'No status with state "success" was available');

      if (status && status.state === 'success') {
        return status;
      }

      throw Error(`Unknown status error ${status.state}`);
    } catch (e) {
      console.log('Deployment unavailable or not successful, retrying...');
      console.log(e);
      await new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
    }
  }
  setFailed(`Timeout reached: Unable to wait for an deployment to be successful`);
};

const run = async () => {
  try {
    // Inputs
    const GITHUB_TOKEN = getInput('token', { required: true });
    const ENVIRONMENT = getInput('environment');
    const MAX_TIMEOUT = Number(getInput('max_timeout')) || 60;
    const ALLOW_INACTIVE = Boolean(getInput('allow_inactive')) || false;
    const CHECK_INTERVAL_IN_MS = (Number(getInput('check_interval')) || 2) * 1000;

    assert(!!GITHUB_TOKEN, 'Required field `token` was not provided');

    const octokit = github.getOctokit(GITHUB_TOKEN);

    const context = github.context;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const PR_NUMBER = github?.context?.payload?.pull_request?.number;

    assert(!!PR_NUMBER, 'No pull request number was found');

    const currentPR = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: PR_NUMBER,
    });

    if (currentPR.status !== 200) {
      setFailed('Could not get information about the current pull request');
    }

    const prSHA = currentPR.data.head.sha;

    const deployments = await octokit.rest.repos.listDeployments({
      owner,
      repo,
      sha: prSHA,
      environment: ENVIRONMENT,
    });

    assert(deployments.data.length > 0, `no deployments in ${JSON.stringify(deployments)}`);

    const deployment = deployments.data[0];

    const status = await waitForStatus({
      owner,
      repo,
      deployment_id: deployment.id,
      token: GITHUB_TOKEN,
      maxTimeout: MAX_TIMEOUT,
      allowInactive: ALLOW_INACTIVE,
      checkIntervalInMilliseconds: CHECK_INTERVAL_IN_MS,
    });

    const targetUrl = status.target_url;

    if (!targetUrl) {
      console.log(`no status found, running again`);
      await run();
      return;
    }

    console.log('target url »', targetUrl);

    setOutput('url', targetUrl);

    console.log(`Waiting for a status code 200 from: ${targetUrl}`);
    await waitForUrl({ url: targetUrl, maxTimeout: MAX_TIMEOUT, checkIntervalInMilliseconds: CHECK_INTERVAL_IN_MS });
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed(`unspecified error occurred.  Oh my`);
    }
  }
};

run();
