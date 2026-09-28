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
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Type the start of a locality name...',
				typeOptions: { searchListMethod: 'searchLocalities', searchable: true },
			},
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
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Type the start of a street name...',
				typeOptions: { searchListMethod: 'searchStreets', searchable: true },
			},
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

const OPTION_DEFINITIONS: Record<string, INodeProperties> = {
	language: languageOption,
	nameMatching: {
		displayName: 'Name Matching',
		name: 'nameMatching',
		type: 'options',
		options: [
			{
				name: 'Exact',
				value: 'exact',
				description:
					'Use the exact name match, else the only result, else fail and list the candidates',
			},
			{
				name: 'First Result',
				value: 'first',
				description: 'Use the exact name match, else the first result',
			},
		],
		default: 'exact',
		description: 'How a locality or street name picks one Israel Post entry',
	},
	onNotFound: {
		displayName: 'On Not Found',
		name: 'onNotFound',
		type: 'options',
		options: [
			{ name: 'Error', value: 'error', description: 'Fail the item' },
			{
				name: 'Return Empty',
				value: 'empty',
				description: 'Output the item with found set to false and zip set to null',
			},
		],
		default: 'error',
		description: 'What to do when there is no zip code for the input',
	},
};

/** The Options collection with the given options, kept in alphabetical order. */
export function optionsCollection(show: Show, names: string[]): INodeProperties {
	return {
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: names
			.map((name) => OPTION_DEFINITIONS[name])
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	};
}
