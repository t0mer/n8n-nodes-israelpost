import type { INodeProperties } from 'n8n-workflow';
import { languageOption, localityLocator, searchProperties } from './common';

const show = { resource: ['street'], operation: ['search'] };

export const streetProperties: INodeProperties[] = [
	localityLocator(show),
	...searchProperties(show, 'street'),
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
