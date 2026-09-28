import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class IsraelPostApi implements ICredentialType {
	name = 'israelPostApi';

	displayName = 'Israel Post API';

	icon: Icon = {
		light: 'file:../nodes/IsraelPost/israelpost.svg',
		dark: 'file:../nodes/IsraelPost/israelpost.dark.svg',
	};

	documentationUrl = 'https://github.com/t0mer/n8n-nodes-israelpost#credentials';

	properties: INodeProperties[] = [
		{
			displayName:
				'The default key is the public key the Israel Post website uses. Replace it only if requests start failing with 401: open https://doar.israelpost.co.il/locatezip, look up any zip, and copy the Ocp-Apim-Subscription-Key header from the browser network tab.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		// The key is public, but it is still a key: keep it masked like any other.
		// eslint-disable-next-line @n8n/community-nodes/credential-unnecessary-password
		{
			displayName: 'Subscription Key',
			name: 'subscriptionKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '5ccb5b137e7444d885be752eda7f767a',
			description: 'Sent as the Ocp-Apim-Subscription-Key header',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://apimftprd.israelpost.co.il/mypost-zip',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Ocp-Apim-Subscription-Key': '={{$credentials.subscriptionKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/getcities-lang',
			qs: { CityStartsWith: 'תל', Lang: 'he' },
		},
	};
}
