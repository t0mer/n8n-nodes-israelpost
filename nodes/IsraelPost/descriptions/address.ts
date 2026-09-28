import type { INodeProperties } from 'n8n-workflow';
import { optionsCollection } from './common';

const show = { resource: ['address'], operation: ['findByZip'] };

export const addressProperties: INodeProperties[] = [
	{
		displayName: 'Zip Code',
		name: 'zip',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 6439612',
		description: 'Seven-digit Israeli zip code (מיקוד). Spaces and dashes are ignored.',
		displayOptions: { show },
	},
	optionsCollection(show, ['delayMs', 'includeRaw', 'language', 'onNotFound', 'outputField']),
];
