import type { INodeProperties } from 'n8n-workflow';
import { localityLocator, optionsCollection, streetLocator } from './common';

const byAddress = { resource: ['zipCode'], operation: ['findByAddress'] };

export const zipCodeProperties: INodeProperties[] = [
	localityLocator(byAddress),
	streetLocator(byAddress),
	{
		displayName: 'House Number',
		name: 'houseNumber',
		type: 'string',
		default: '',
		placeholder: 'e.g. 100',
		description:
			'Required when a street is set. Digits only: Israel Post does not accept letter suffixes such as 12א.',
		displayOptions: { show: byAddress },
	},
	{
		displayName: 'Entrance',
		name: 'entrance',
		type: 'string',
		default: '',
		placeholder: 'e.g. א',
		description: 'Building entrance (כניסה), usually a Hebrew letter',
		hint: 'Needed for some buildings in divided localities. Leave empty otherwise: an entrance the building does not have returns no zip code.',
		displayOptions: { show: byAddress },
	},
	optionsCollection(byAddress, ['language', 'nameMatching', 'onNotFound']),
];
