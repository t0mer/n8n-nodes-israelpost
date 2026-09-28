import { vi } from 'vitest';
import { FIXTURES, type FixtureName } from './fixtures';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

export const NODE: INode = {
	id: '1',
	name: 'Israel Post',
	type: 'CUSTOM.israelPost',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** Loads a Phase 0 fixture from test/fixtures. */
export function fixture(name: FixtureName): unknown {
	return structuredClone(FIXTURES[name]);
}

export type FakeResponse = { statusCode: number; body: unknown } | Error;

export const ok = (body: unknown): FakeResponse => ({ statusCode: 200, body });

/** Serves a fixture by request path + query, so tests don't depend on call order. */
export type Router = (path: string, qs: IDataObject) => FakeResponse;

export interface FakeOptions {
	params?: IDataObject | IDataObject[];
	items?: number;
	inputJson?: IDataObject[];
	continueOnFail?: boolean;
	credentials?: IDataObject;
}

/** IExecuteFunctions stand-in. HTTP responses come from a queue or a router; calls are recorded. */
export function fakeCtx(responses: FakeResponse[] | Router = [], opts: FakeOptions = {}) {
	const queue = Array.isArray(responses) ? [...responses] : [];
	const calls: Array<{ path: string; qs: IDataObject; options: IHttpRequestOptions }> = [];
	const credentials = opts.credentials ?? {
		subscriptionKey: 'test-key',
		baseUrl: 'https://example.test/mypost-zip',
	};
	const serve = async (_type: string, options: IHttpRequestOptions) => {
		const path = String(options.url).replace(String(credentials.baseUrl).replace(/\/+$/, ''), '');
		const qs = (options.qs ?? {}) as IDataObject;
		calls.push({ path, qs, options });
		const next = Array.isArray(responses) ? queue.shift() : responses(path, qs);
		if (!next) throw new Error(`no fake response for ${path}`);
		if (next instanceof Error) throw next;
		return { headers: {}, ...next };
	};
	const itemCount =
		opts.items ?? opts.inputJson?.length ?? (Array.isArray(opts.params) ? opts.params.length : 1);
	const paramsFor = (i: number) =>
		(Array.isArray(opts.params) ? opts.params[i] : opts.params) ?? {};
	const inputFor = (i: number) => ({ json: { ...(opts.inputJson?.[i] ?? {}) } });
	const ctx = {
		getNode: () => NODE,
		getInputData: () => Array.from({ length: itemCount }, (_, i) => inputFor(i)),
		continueOnFail: () => opts.continueOnFail ?? false,
		getCredentials: async () => credentials,
		getNodeParameter(name: string, i: number, fallback?: unknown, options?: IDataObject) {
			const [head, ...rest] = name.split('.');
			let value: unknown = paramsFor(i)[head];
			for (const key of rest) value = (value as IDataObject | undefined)?.[key];
			if (value !== undefined) {
				if (options?.extractValue && typeof value === 'object' && value !== null) {
					return (value as IDataObject).value;
				}
				return value;
			}
			// Like n8n: a missing parameter without a fallback value throws.
			if (fallback === undefined) throw new Error(`Could not get parameter "${name}"`);
			return fallback;
		},
		helpers: {
			httpRequestWithAuthentication: vi.fn(serve),
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, calls };
}
