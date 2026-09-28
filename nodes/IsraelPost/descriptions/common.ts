import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

type Show = NonNullable<NonNullable<INodeProperties['displayOptions']>['show']>;

export const languageOption: INodeProperties = {
	displayName: 'Language',
	name: 'language',
	type: 'options',
	options: [
		{ name: 'English', value: 'en' },
		{ name: 'Hebrew', value: 'he' },
	] as INodePropertyOptions[],
	default: 'he',
	description: 'Language of names and messages in the response, and of the names you search for',
};

/** Search Text + Return All + Limit for a search operation. */
export function searchProperties(show: Show, what: string): INodeProperties[] {
	return [
		{
			displayName: 'Search Text',
			name: 'searchText',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. תל א',
			description: `Start of the ${what} name. Israel Post matches it against the start of the name and of its synonym.`,
			displayOptions: { show },
		},
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}

const idValidation = (what: string) => [
	{
		type: 'regex' as const,
		properties: { regex: '^\\d+$', errorMessage: `Not a valid ${what} ID (digits only)` },
	},
];

/** Locality picker: by name (default), or by Israel Post locality ID. */
export function localityLocator(show: Show): INodeProperties {
	return {
		displayName: 'Locality',
		name: 'locality',
		type: 'resourceLocator',
		default: { mode: 'name', value: '' },
		required: true,
		description: 'City, town or village (יישוב)',
		displayOptions: { show },
		modes: [
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: 'e.g. תל אביב - יפו',
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 1212',
				validation: idValidation('locality'),
			},
		],
	};
}

/** Street picker: by name (default), or by Israel Post street ID. */
export function streetLocator(show: Show): INodeProperties {
	return {
		displayName: 'Street',
		name: 'street',
		type: 'resourceLocator',
		default: { mode: 'name', value: '' },
		description:
			'Leave empty to get the locality-wide zip code, for localities that have a single one',
		displayOptions: { show },
		modes: [
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: 'e.g. דיזנגוף',
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 91992',
				validation: idValidation('street'),
			},
		],
	};
}
