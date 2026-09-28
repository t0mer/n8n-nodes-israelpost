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
