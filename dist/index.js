'use strict';
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = __importDefault(require('@actions/core'));
const github_1 = __importDefault(require('@actions/github'));
const axios_1 = __importDefault(require('axios'));
const assert_ts_1 = require('assert-ts');
const waitForUrl = ({ url, maxTimeout, checkIntervalInMilliseconds }) =>
  __awaiter(void 0, void 0, void 0, function* () {
    const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);
    for (let i = 0; i < iterations; i++) {
      try {
        yield axios_1.default.get(url);
        return;
      } catch (e) {
        console.log('Url unavailable, retrying...');
        yield new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
      }
    }
    core_1.default.setFailed(`Timeout reached: Unable to connect to ${url}`);
  });
const waitForStatus = ({ token, owner, repo, deployment_id, maxTimeout, allowInactive, checkIntervalInMilliseconds }) =>
  __awaiter(void 0, void 0, void 0, function* () {
    const octokit = github_1.default.getOctokit(token);
    const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);
    for (let i = 0; i < iterations; i++) {
      try {
        const statuses = yield octokit.rest.repos.listDeploymentStatuses({
          owner,
          repo,
          deployment_id,
        });
        const status = statuses.data.length > 0 && statuses.data[0];
        if (!status) {
          throw Error('No status was available');
        }
        if (status && allowInactive === true && status.state === 'inactive') {
          return status;
        }
        if (status && status.state !== 'success') {
          throw Error('No status with state "success" was available');
        }
        if (status && status.state === 'success') {
          return status;
        }
        throw Error('Unknown status error');
      } catch (e) {
        console.log('Deployment unavailable or not successful, retrying...');
        console.log(e);
        yield new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
      }
    }
    core_1.default.setFailed(`Timeout reached: Unable to wait for an deployment to be successful`);
  });
const run = () =>
  __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
      // Inputs
      const GITHUB_TOKEN = core_1.default.getInput('token', { required: true });
      const ENVIRONMENT = core_1.default.getInput('environment');
      const MAX_TIMEOUT = Number(core_1.default.getInput('max_timeout')) || 60;
      const ALLOW_INACTIVE = Boolean(core_1.default.getInput('allow_inactive')) || false;
      const CHECK_INTERVAL_IN_MS = (Number(core_1.default.getInput('check_interval')) || 2) * 1000;
      // Fail if we have don't have a github token
      if (!GITHUB_TOKEN) {
        core_1.default.setFailed('Required field `token` was not provided');
      }
      const octokit = github_1.default.getOctokit(GITHUB_TOKEN);
      const context = github_1.default.context;
      const owner = context.repo.owner;
      const repo = context.repo.repo;
      const PR_NUMBER =
        (_c =
          (_b =
            (_a = github_1.default === null || github_1.default === void 0 ? void 0 : github_1.default.context) === null || _a === void 0
              ? void 0
              : _a.payload) === null || _b === void 0
            ? void 0
            : _b.pull_request) === null || _c === void 0
          ? void 0
          : _c.number;
      (0, assert_ts_1.assert)(!!PR_NUMBER, 'No pull request number was found');
      const currentPR = yield octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: PR_NUMBER,
      });
      if (currentPR.status !== 200) {
        core_1.default.setFailed('Could not get information about the current pull request');
      }
      const prSHA = currentPR.data.head.sha;
      const deployments = yield octokit.rest.repos.listDeployments({
        owner,
        repo,
        sha: prSHA,
        environment: ENVIRONMENT,
      });
      (0, assert_ts_1.assert)(deployments.data.length > 0, `no deployments in ${JSON.stringify(deployments)}`);
      const deployment = deployments.data[0];
      const status = yield waitForStatus({
        owner,
        repo,
        deployment_id: deployment.id,
        token: GITHUB_TOKEN,
        maxTimeout: MAX_TIMEOUT,
        allowInactive: ALLOW_INACTIVE,
        checkIntervalInMilliseconds: CHECK_INTERVAL_IN_MS,
      });
      // Get target url
      const targetUrl = status === null || status === void 0 ? void 0 : status.target_url;
      if (!targetUrl) {
        console.log(`no status found, running again`);
        yield run();
        return;
      }
      console.log('target url »', targetUrl);
      // Set output
      core_1.default.setOutput('url', targetUrl);
      // Wait for url to respond with a sucess
      console.log(`Waiting for a status code 200 from: ${targetUrl}`);
      yield waitForUrl({ url: targetUrl, maxTimeout: MAX_TIMEOUT, checkIntervalInMilliseconds: CHECK_INTERVAL_IN_MS });
    } catch (error) {
      if (error instanceof Error) {
        core_1.default.setFailed(error.message);
      } else {
        core_1.default.setFailed(`unspecified error occurred.  Oh my`);
      }
    }
  });
run();
//# sourceMappingURL=index.js.map
