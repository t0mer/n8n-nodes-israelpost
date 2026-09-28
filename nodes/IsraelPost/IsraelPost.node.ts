import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { operationProperties, resourceProperty } from './descriptions/resources';
import { localityProperties } from './descriptions/locality';
import { streetProperties } from './descriptions/street';
import { searchLocalities } from './operations/searchLocalities';
import { searchStreets } from './operations/searchStreets';
import type { Operation } from './operations/types';

const OPERATIONS: Record<string, Operation> = {
	'locality.search': searchLocalities,
	'street.search': searchStreets,
};

export class IsraelPost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Israel Post',
		name: 'israelPost',
		icon: { light: 'file:israelpost.svg', dark: 'file:israelpost.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Find Israeli postal codes (mikud) by address or PO box',
		defaults: {
			name: 'Israel Post',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'israelPostApi', required: true }],
		properties: [
			resourceProperty,
			...operationProperties,
			...localityProperties,
			...streetProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			let failure: Error | undefined;
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const run = OPERATIONS[`${resource}.${operation}`];
				if (!run) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
					);
				}
				const rows: IDataObject[] = await run.call(this, i);
				for (const json of rows) returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				failure = error as Error;
			}
			if (!failure) continue;
			if (this.continueOnFail()) {
				returnData.push({ json: { error: failure.message }, pairedItem: { item: i } });
				continue;
			}
			// Re-wrapping keeps the original instance, so set the item index directly.
			if (failure instanceof NodeApiError || failure instanceof NodeOperationError) {
				failure.context.itemIndex = i;
				throw failure;
			}
			throw new NodeOperationError(this.getNode(), failure, { itemIndex: i });
		}

		return [returnData];
	}
}
