import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { searchAddressByZip } from '../api';
import { notFound, readLookupOptions } from './common';

export async function findByZip(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = readLookupOptions(this, itemIndex);
	const input = String(this.getNodeParameter('zip', itemIndex)).trim();
	const zip = input.replace(/[\s-]/g, '');
	if (!/^\d{7}$/.test(zip)) {
		throw new NodeOperationError(this.getNode(), `Zip Code "${input}" is not valid: use 7 digits`, {
			itemIndex,
		});
	}

	const result = await searchAddressByZip(this, zip, options.lang, itemIndex);
	const raw = options.includeRaw ? { raw: { address: result } } : {};
	if (result.msgtype === 'notfound' || !result.cityid) {
		// PO box zip codes are not addresses, so Israel Post reports them as not found too.
		const row = notFound(this, itemIndex, options, `No address found for zip code ${zip}`, {
			locality: null,
			street: null,
			house: '',
			entrance: '',
		});
		return [{ ...row, ...raw }];
	}
	return [
		{
			found: true,
			zip,
			locality: { id: result.cityid, name: result.cityname, code: null },
			street: result.streetid ? { id: result.streetid, name: result.streetname, code: null } : null,
			house: result.houseNum ?? '',
			entrance: result.entrance ?? '',
			message: result.messageResult,
			...raw,
		},
	];
}
