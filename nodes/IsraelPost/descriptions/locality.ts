import type { INodeProperties } from 'n8n-workflow';
import { languageOption, searchProperties } from './common';

const show = { resource: ['locality'], operation: ['search'] };

export const localityProperties: INodeProperties[] = [
	...searchProperties(show, 'locality'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: [languageOption],
	},
];
