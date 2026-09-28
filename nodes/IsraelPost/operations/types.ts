import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import type { LookupCache } from './lookup';

/** Runs one operation for input item `itemIndex` and returns its output rows. */
export type Operation = (
	this: IExecuteFunctions,
	itemIndex: number,
	cache: LookupCache,
) => Promise<IDataObject[]>;
