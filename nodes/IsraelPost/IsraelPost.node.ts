import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class IsraelPost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Israel Post',
		name: 'israelPost',
		icon: { light: 'file:israelpost.svg', dark: 'file:israelpost.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description: 'Find Israeli postal codes by address or PO box',
		defaults: {
			name: 'Israel Post',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'israelPostApi', required: true }],
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return [this.getInputData()];
	}
}
