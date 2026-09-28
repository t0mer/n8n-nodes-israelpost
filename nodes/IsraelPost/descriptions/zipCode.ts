import type { INodeProperties } from 'n8n-workflow';
import { localityLocator, optionsCollection, streetLocator } from './common';

const byAddress = { resource: ['zipCode'], operation: ['findByAddress'] };
const byPoBox = { resource: ['zipCode'], operation: ['findByPoBox'] };

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
	localityLocator(byPoBox),
	{
		displayName: 'PO Box Number',
		name: 'poBox',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 100',
		description: 'PO box (ת.ד.) number, digits only',
		displayOptions: { show: byPoBox },
	},
	optionsCollection(byPoBox, ['language', 'nameMatching', 'onNotFound']),
];
