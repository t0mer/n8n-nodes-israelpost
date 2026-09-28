// Records the README demo: n8n running demo/workflow.json with the Israel Post node.
//
//   npm run build && npm run demo:record
//
// 1. Starts n8n (`n8n-node dev`) with a throwaway user folder (~/.n8n-israelpost-demo, outside
//    the repository: n8n-node links the project into it, so a folder inside the repo loops).
// 2. Setup, not recorded: creates the owner account, logs in, dismisses the survey and creates
//    the "Israel Post account" credential through the REST API with the node's default public key.
// 3. Recording: pastes the workflow, runs it and opens each Israel Post node's output.
// 4. Stops n8n and converts the video to docs/demo.mp4 (plus docs/demo-poster.png) with ffmpeg.
//
// Costs about 14 Israel Post API calls per run. Raw video, logs and the owner password go to the
// gitignored recordings/ folder. Plain .mjs on purpose: the node lint rules (no process/console)
// apply to every .ts file in the repository.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, selectors } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'recordings');
const userFolder = join(homedir(), '.n8n-israelpost-demo');
const videoDir = join(out, 'video');
const mp4 = join(root, 'docs/demo.mp4');
const poster = join(root, 'docs/demo-poster.png');
const BASE = 'http://localhost:5678';
const EMAIL = 'demo@example.com';
const VIEWPORT = { width: 1280, height: 800 };
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const NODE_TYPE = '@t0mer/n8n-nodes-israelpost.israelPost';
const CREDENTIAL = {
	name: 'Israel Post account',
	type: 'israelPostApi',
	// The node's defaults: the public key the Israel Post website ships in its JavaScript.
	data: {
		subscriptionKey: '5ccb5b137e7444d885be752eda7f767a',
		baseUrl: 'https://apimftprd.israelpost.co.il/mypost-zip',
	},
};

selectors.setTestIdAttribute('data-test-id');
let recordStart = 0;
let trimStart = 0; // seconds of blank page load cut from the start of the video
let posterAt = 1; // seconds into the video: the zip table, once rendered
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const debug = (page, name) =>
	process.env.DEMO_DEBUG ? page.screenshot({ path: join(out, `debug-${name}.png`) }) : null;

/** Owner password for the throwaway instance, kept in the gitignored recordings folder. */
function ownerPassword() {
	const file = join(out, 'owner.json');
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).password;
	const password = `Demo-${randomBytes(8).toString('hex')}A1`;
	writeFileSync(file, JSON.stringify({ email: EMAIL, password }));
	return password;
}

async function waitForN8n(child) {
	for (let i = 0; i < 120; i++) {
		if (child.exitCode !== null) throw new Error('n8n exited early; see recordings/n8n.log');
		try {
			// /healthz answers before the REST routes are registered.
			if ((await fetch(`${BASE}/rest/settings`)).ok) return;
		} catch {
			// not up yet
		}
		await sleep(3000);
	}
	throw new Error('n8n did not start within 6 minutes');
}

/** Visible cursor and caption overlay (headless video has no cursor). */
function overlay() {
	let caption;
	let cursor;
	// The app may re-render <body>, so the elements are (re)created on demand.
	const ensure = () => {
		if (!document.body) return false;
		if (!cursor?.isConnected) {
			cursor = document.createElement('div');
			Object.assign(cursor.style, {
				position: 'fixed',
				width: '18px',
				height: '18px',
				borderRadius: '50%',
				zIndex: 2147483647,
				background: 'rgba(225,29,72,.85)',
				border: '2px solid #fff',
				pointerEvents: 'none',
				boxShadow: '0 0 6px rgba(0,0,0,.4)',
				transform: 'translate(-50%,-50%)',
				left: '-40px',
				top: '-40px',
				transition: 'width .12s, height .12s',
			});
			document.body.append(cursor);
		}
		if (!caption?.isConnected) {
			caption = document.createElement('div');
			Object.assign(caption.style, {
				position: 'fixed',
				left: '50%',
				bottom: '12px',
				transform: 'translateX(-50%)',
				zIndex: 2147483646,
				background: 'rgba(15,23,42,.9)',
				color: '#fff',
				font: '600 20px/1.3 system-ui, sans-serif',
				padding: '10px 18px',
				borderRadius: '10px',
				pointerEvents: 'none',
				display: 'none',
				maxWidth: '90%',
				textAlign: 'center',
			});
			document.body.append(caption);
		}
		return true;
	};
	document.addEventListener(
		'mousemove',
		(e) => {
			if (!ensure()) return;
			cursor.style.left = `${e.clientX}px`;
			cursor.style.top = `${e.clientY}px`;
		},
		true,
	);
	document.addEventListener('mousedown', () => ensure() && (cursor.style.width = cursor.style.height = '26px'), true);
	document.addEventListener('mouseup', () => ensure() && (cursor.style.width = cursor.style.height = '18px'), true);
	window.__caption = (text, top) => {
		if (!ensure()) return;
		// On the canvas the bottom bar holds the Execute button, so captions go to the top there.
		caption.style.top = top ? '96px' : '';
		caption.style.bottom = top ? '' : '12px';
		caption.textContent = text;
		caption.style.display = text ? 'block' : 'none';
	};
}

async function caption(page, text, { top = false } = {}) {
	await page.evaluate(([t, onTop]) => window.__caption?.(t, onTop), [text, top]);
}

/** Moves the visible cursor to an element, then clicks it. */
async function clickOn(page, locator, { dbl = false } = {}) {
	const box = await locator.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
	await sleep(250);
	if (dbl) await locator.dblclick();
	else await locator.click();
}

async function restFromPage(page, path, init = {}) {
	return page.evaluate(
		async ({ path, init }) => {
			const headers = {
				'browser-id': localStorage.getItem('n8n-browserId') ?? '',
				'content-type': 'application/json',
			};
			const res = await fetch(path, { ...init, headers });
			return { status: res.status, body: await res.json().catch(() => null) };
		},
		{ path, init },
	);
}

async function setup(browser) {
	const password = ownerPassword();
	// Right after start-up the route can still answer 404, so retry for a while.
	let res;
	for (let i = 0; i < 20; i++) {
		res = await fetch(`${BASE}/rest/owner/setup`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, firstName: 'Demo', lastName: 'User', password }),
		});
		if (res.status !== 404) break;
		await sleep(3000);
	}
	if (!res.ok && res.status !== 400) throw new Error(`owner setup failed: ${res.status}`);
	console.log(`Owner setup: HTTP ${res.status}`);

	const ctx = await browser.newContext({ viewport: VIEWPORT });
	const page = await ctx.newPage();
	// Log in through REST (the context shares the auth cookie with the page).
	const login = await page.request.post(`${BASE}/rest/login`, {
		data: { emailOrLdapLoginId: EMAIL, password },
	});
	if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
	await page.goto(`${BASE}/home/workflows`);
	await page.waitForURL(/\/home\//, { timeout: 30000 });
	// Answer the first-login "Customize n8n" survey with nothing, so it never opens again.
	const settings = await restFromPage(page, '/rest/settings');
	const survey = await restFromPage(page, '/rest/me/survey', {
		method: 'POST',
		body: JSON.stringify({
			version: 'v4',
			personalization_survey_submitted_at: new Date().toISOString(),
			personalization_survey_n8n_version: String(settings.body?.data?.versionCli ?? 'unknown'),
		}),
	});
	if (survey.status >= 300) throw new Error(`survey dismiss failed: ${survey.status}`);

	const list = await restFromPage(page, '/rest/credentials');
	let credential = list.body?.data?.find((c) => c.name === CREDENTIAL.name);
	if (!credential) {
		const created = await restFromPage(page, '/rest/credentials', {
			method: 'POST',
			body: JSON.stringify(CREDENTIAL),
		});
		if (created.status >= 300) throw new Error(`credential create failed: ${created.status}`);
		credential = created.body.data;
	}

	// Pasting a workflow opens a one-time "Pasting this from an AI tool?" prompt: turn it off here,
	// outside the recording.
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
	await page.goto(`${BASE}/workflow/new`);
	await page.getByTestId('zoom-to-fit').waitFor({ timeout: 30000 });
	await sleep(1500);
	const trigger = {
		id: 't',
		name: 'Start',
		type: 'n8n-nodes-base.manualTrigger',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	await page.evaluate((t) => navigator.clipboard.writeText(t), JSON.stringify({ nodes: [trigger], connections: {} }));
	await page.mouse.click(520, 600);
	await page.keyboard.press('Control+V');
	const prompt = page.getByRole('dialog').filter({ hasText: 'Pasting this from an AI tool?' });
	await sleep(2000);
	await debug(page, 'setup-paste');
	if (await prompt.isVisible({ timeout: 5000 }).catch(() => false)) {
		await prompt.getByText("Don't show again").click();
		await prompt.getByRole('button', { name: 'Skip' }).click();
	}
	const state = join(out, 'state.json');
	await ctx.storageState({ path: state });
	await ctx.close();
	return { state, credentialId: credential.id };
}

/** demo/workflow.json uses the published node type; dev mode loads community nodes as CUSTOM.*. */
function workflowForDev(credentialId) {
	const wf = JSON.parse(readFileSync(join(root, 'demo/workflow.json'), 'utf8'));
	for (const node of wf.nodes) {
		if (node.type === NODE_TYPE) {
			node.type = 'CUSTOM.israelPost';
			node.credentials.israelPostApi.id = credentialId;
		}
	}
	return JSON.stringify({ nodes: wf.nodes, connections: wf.connections });
}

async function lastExecution(page) {
	const res = await restFromPage(page, '/rest/executions?limit=1');
	return res.body?.data?.results?.[0] ?? res.body?.data?.[0];
}

/** Waits for an execution newer than `previousId` to finish (the user folder keeps old runs). */
async function waitForExecution(page, previousId) {
	for (let i = 0; i < 90; i++) {
		const last = await lastExecution(page);
		if (last && last.id !== previousId && ['success', 'error', 'crashed'].includes(last.status)) {
			return last.status;
		}
		await sleep(500);
	}
	throw new Error('workflow execution did not finish');
}

async function openNode(page, name, text) {
	await caption(page, '');
	await clickOn(page, page.locator('[data-test-id="canvas-node"]', { hasText: name }).first(), { dbl: true });
	await sleep(600);
	await caption(page, text);
	await sleep(600);
}

async function outputMode(page, mode) {
	const button = page.getByTestId('output-panel').getByTestId(`radio-button-${mode}`);
	if (await button.isVisible().catch(() => false)) await clickOn(page, button);
	await sleep(600);
}

/** Drags the node view's middle panel to the left, so the output table gets most of the width. */
async function widenOutput(page) {
	const handle = page.getByTestId('panel-drag-button').first();
	if (!(await handle.isVisible().catch(() => false))) return;
	const box = await handle.boundingBox();
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width / 2, y, { steps: 12 });
	await page.mouse.down();
	await page.mouse.move(330, y, { steps: 15 });
	await page.mouse.up();
	await sleep(400);
}

async function closeNode(page) {
	await caption(page, '');
	await page.keyboard.press('Escape');
	await sleep(700);
}

async function record(browser, state, credentialId) {
	const ctx = await browser.newContext({
		viewport: VIEWPORT,
		storageState: state,
		recordVideo: { dir: videoDir, size: VIEWPORT },
	});
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
	await ctx.addInitScript(overlay);
	const page = await ctx.newPage();
	recordStart = Date.now();
	await page.goto(`${BASE}/workflow/new`);
	// The execute button only exists once there are nodes; the zoom controls exist on an empty canvas.
	await page.getByTestId('zoom-to-fit').waitFor({ timeout: 30000 });
	await sleep(500);
	trimStart = (Date.now() - recordStart) / 1000;

	await caption(page, 'Israel Post for n8n: find Israeli zip codes (מיקוד) by address or PO box', { top: true });
	await page.evaluate((t) => navigator.clipboard.writeText(t), workflowForDev(credentialId));
	// Empty canvas, clear of the "Add first step" button in the middle.
	await page.mouse.move(520, 600, { steps: 15 });
	await page.mouse.click(520, 600);
	await page.keyboard.press('Control+V');
	await sleep(1000);
	await page.getByTestId('zoom-to-fit').click();
	await sleep(2000);
	await debug(page, 'canvas');

	await caption(page, 'Run it: 5 addresses, plus a PO box on a separate branch', { top: true });
	const previousId = (await lastExecution(page))?.id;
	await clickOn(page, page.getByTestId('execute-workflow-button'));
	const runStarted = Date.now();
	const status = await waitForExecution(page, previousId);
	if (status !== 'success') throw new Error(`demo workflow ended with ${status}`);
	console.log(`Execution took ${((Date.now() - runStarted) / 1000).toFixed(1)} s`);
	await sleep(1200);

	await openNode(page, 'Find Zip by Address', 'Find by Address: each zip lands in the "postal" field');
	await widenOutput(page);
	await outputMode(page, 'table');
	await page.mouse.move(1000, 480, { steps: 10 }); // off the Table button, over the rows
	await sleep(1800);
	posterAt = (Date.now() - recordStart) / 1000 - trimStart;
	await debug(page, 'table');
	await sleep(700);
	// Scroll slowly down through the rows: a zip for each address, then the ambiguous one.
	for (let i = 0; i < 14; i++) {
		await page.mouse.wheel(0, 90);
		await sleep(180);
	}
	await debug(page, 'scrolled');
	await caption(page, 'Ambiguous street "דיזנגו": Continue On Fail keeps going and lists the candidates');
	const errorCell = page.getByTestId('output-panel').getByText('is ambiguous').first();
	await errorCell.scrollIntoViewIfNeeded();
	const box = await errorCell.boundingBox();
	await page.mouse.move(box.x - 45, box.y + box.height / 2, { steps: 15 });
	await sleep(3800);
	await debug(page, 'error');
	await closeNode(page);

	await openNode(page, 'Find Zip by PO Box', 'Find by PO Box: אלעד, PO box 100 → 4081002');
	await widenOutput(page);
	await outputMode(page, 'table');
	await page.mouse.move(1000, 400, { steps: 10 });
	await sleep(2800);
	await debug(page, 'pobox');
	await closeNode(page);
	await caption(page, '');
	await sleep(500);
	const video = page.video();
	await ctx.close();
	return video.path();
}

function ffmpeg(args) {
	const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

/** H.264 MP4 that plays everywhere, plus a poster frame (the zip table) for the README. */
function toMp4(webm) {
	ffmpeg(['-ss', trimStart.toFixed(2), '-i', webm, '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
	ffmpeg(['-ss', String(posterAt), '-i', mp4, '-frames:v', '1', poster]);
	const size = statSync(mp4).size;
	console.log(`docs/demo.mp4: ${(size / 1048576).toFixed(2)} MB; poster: docs/demo-poster.png`);
	if (size > MAX_VIDEO_BYTES) throw new Error('docs/demo.mp4 is over 5 MB');
}

mkdirSync(out, { recursive: true });
mkdirSync(join(root, 'docs'), { recursive: true });
rmSync(videoDir, { recursive: true, force: true });

const log = openSync(join(out, 'n8n.log'), 'w');
const n8n = spawn('npx', ['n8n-node', 'dev', '--custom-user-folder', userFolder], {
	cwd: root,
	detached: true,
	stdio: ['ignore', log, log],
});
const stop = () => {
	try {
		process.kill(-n8n.pid, 'SIGTERM');
	} catch {
		// already stopped
	}
};
process.on('exit', stop);

let browser;
try {
	console.log('Starting n8n…');
	await waitForN8n(n8n);
	browser = await chromium.launch();
	const { state, credentialId } = await setup(browser);
	console.log('Recording…');
	const webm = await record(browser, state, credentialId);
	const raw = join(out, 'demo.webm');
	renameSync(webm, raw);
	toMp4(raw);
	console.log(`Raw video: ${raw}`);
} finally {
	await browser?.close();
	stop();
}
