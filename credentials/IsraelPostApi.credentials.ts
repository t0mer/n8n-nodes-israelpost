import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class IsraelPostApi implements ICredentialType {
	name = 'israelPostApi';

	displayName = 'Israel Post API';

	icon: Icon = {
		light: 'file:../nodes/IsraelPost/israelpost.svg',
		dark: 'file:../nodes/IsraelPost/israelpost.dark.svg',
	};

	documentationUrl = 'https://github.com/t0mer/n8n-nodes-israelpost#credentials';

	properties: INodeProperties[] = [];

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://apimftprd.israelpost.co.il/mypost-zip',
			url: '/getcities-lang',
		},
	};
}
