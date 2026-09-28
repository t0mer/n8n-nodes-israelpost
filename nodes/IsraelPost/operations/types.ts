import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

/** Runs one operation for input item `itemIndex` and returns its output rows. */
export type Operation = (this: IExecuteFunctions, itemIndex: number) => Promise<IDataObject[]>;
