"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const axios_1 = __importDefault(require("axios"));
const assert_ts_1 = require("assert-ts");
const waitForUrl = ({ url, maxTimeout, checkIntervalInMilliseconds, }) => __awaiter(void 0, void 0, void 0, function* () {
    const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);
    for (let i = 0; i < iterations; i++) {
        try {
            yield axios_1.default.get(url);
            return;
        }
        catch (e) {
            console.log('Url unavailable, retrying...');
            yield new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
        }
    }
    (0, core_1.setFailed)(`Timeout reached: Unable to connect to ${url}`);
});
const waitForStatus = ({ token, owner, repo, deployment_id, maxTimeout, allowInactive, checkIntervalInMilliseconds, }) => __awaiter(void 0, void 0, void 0, function* () {
    const octokit = (0, github_1.getOctokit)(token);
    const iterations = maxTimeout / (checkIntervalInMilliseconds / 1000);
    for (let i = 0; i < iterations; i++) {
        try {
            const statuses = yield octokit.rest.repos.listDeploymentStatuses({
                owner,
                repo,
                deployment_id,
            });
            const status = statuses.data.length > 0 && statuses.data[0];
            (0, assert_ts_1.assert)(!!status, 'No status was available');
            if (allowInactive === true && status.state === 'inactive') {
                return status;
            }
            (0, assert_ts_1.assert)(status.state === 'success', 'No status with state "success" was available');
            if (status && status.state === 'success') {
                return status;
            }
            throw Error(`Unknown status error ${status.state}`);
        }
        catch (e) {
            console.log('Deployment unavailable or not successful, retrying...');
            console.log(e);
            yield new Promise((r) => setTimeout(r, checkIntervalInMilliseconds));
        }
    }
    (0, core_1.setFailed)(`Timeout reached: Unable to wait for an deployment to be successful`);
});
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Inputs
        const GITHUB_TOKEN = (0, core_1.getInput)('token', { required: true });
        const ENVIRONMENT = (0, core_1.getInput)('environment');
        const MAX_TIMEOUT = Number((0, core_1.getInput)('max_timeout')) || 60;
        const ALLOW_INACTIVE = Boolean((0, core_1.getInput)('allow_inactive')) || false;
        const CHECK_INTERVAL_IN_MS = (Number((0, core_1.getInput)('check_interval')) || 2) * 1000;
        (0, assert_ts_1.assert)(!!GITHUB_TOKEN, 'Required field `token` was not provided');
        const octokit = (0, github_1.getOctokit)(GITHUB_TOKEN);
        const owner = github_1.context.repo.owner;
        const repo = github_1.context.repo.repo;
        const PR_NUMBER = (_b = (_a = github_1.context === null || github_1.context === void 0 ? void 0 : github_1.context.payload) === null || _a === void 0 ? void 0 : _a.pull_request) === null || _b === void 0 ? void 0 : _b.number;
        (0, assert_ts_1.assert)(!!PR_NUMBER, 'No pull request number was found');
        const currentPR = yield octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: PR_NUMBER,
        });
        if (currentPR.status !== 200) {
            (0, core_1.setFailed)('Could not get information about the current pull request');
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
        (0, assert_ts_1.assert)(!!status, `no status available`);
        const targetUrl = status.target_url;
        if (!targetUrl) {
            console.log(`no status found, running again`);
            yield run();
            return;
        }
        console.log('target url »', targetUrl);
        (0, core_1.setOutput)('url', targetUrl);
        console.log(`Waiting for a status code 200 from: ${targetUrl}`);
        yield waitForUrl({ url: targetUrl, maxTimeout: MAX_TIMEOUT, checkIntervalInMilliseconds: CHECK_INTERVAL_IN_MS });
    }
    catch (error) {
        if (error instanceof Error) {
            (0, core_1.setFailed)(error.message);
        }
        else {
            (0, core_1.setFailed)(`unspecified error occurred.  Oh my`);
        }
    }
});
run();
//# sourceMappingURL=index.js.map