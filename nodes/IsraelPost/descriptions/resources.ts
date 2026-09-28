import type { INodeProperties } from 'n8n-workflow';

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Address', value: 'address' },
		{ name: 'Locality', value: 'locality' },
		{ name: 'Street', value: 'street' },
		{ name: 'Zip Code', value: 'zipCode' },
	],
	default: 'zipCode',
};

export const operationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['zipCode'] } },
		options: [
			{
				name: 'Find by Address',
				value: 'findByAddress',
				description: 'Find the zip code of a street address',
				action: 'Find a zip code by address',
			},
			{
				name: 'Find by PO Box',
				value: 'findByPoBox',
				description: 'Find the zip code of a PO box',
				action: 'Find a zip code by PO box',
			},
		],
		default: 'findByAddress',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['locality'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description: 'Search localities by name prefix',
				action: 'Search localities',
			},
		],
		default: 'search',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['street'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description: 'Search the streets of a locality by name prefix',
				action: 'Search streets',
			},
		],
		default: 'search',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['address'] } },
		options: [
			{
				name: 'Find by Zip',
				value: 'findByZip',
				description: 'Find the address a zip code belongs to',
				action: 'Find an address by zip code',
			},
		],
		default: 'findByZip',
	},
];
