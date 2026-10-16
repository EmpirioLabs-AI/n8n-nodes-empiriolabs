import type { INodeProperties } from 'n8n-workflow';

export const MODEL_PARAMETERS_DESCRIPTION =
	'Extra request fields for the selected model as a JSON object, for example {"seed": 42}. Each model lists the fields it accepts in the <a href="https://docs.empiriolabs.ai/models-pricing">EmpirioLabs AI model catalog</a>.';

export function modelParametersOption(): INodeProperties {
	return {
		displayName: 'Model Parameters (JSON)',
		name: 'modelParameters',
		type: 'json',
		default: '{}',
		description: MODEL_PARAMETERS_DESCRIPTION,
	};
}

export function outputFieldOption(): INodeProperties {
	return {
		displayName: 'Put Output in Field',
		name: 'binaryPropertyOutput',
		type: 'string',
		default: 'data',
		hint: 'The name of the output field to put the binary file data in',
	};
}
