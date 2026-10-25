import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	cleanCopy,
	isDataObject,
	mcpRequest,
	parseJson,
	parseJsonObjectParameter,
	TOOL_ERROR_MESSAGE,
} from '../transport';

/**
 * The tool arguments from the Arguments fields: empty fields are left out, and text entered in an
 * object or list field is read as JSON when it is valid JSON.
 * `schema` is the field list saved with the fields, which holds the type of each field.
 */
export function buildToolArguments(values: unknown, schema: unknown): IDataObject {
	const fieldTypes = new Map<string, unknown>();
	if (Array.isArray(schema)) {
		for (const field of schema) {
			if (isDataObject(field) && typeof field.id === 'string') {
				fieldTypes.set(field.id, field.type);
			}
		}
	}

	const args: IDataObject = {};
	if (!isDataObject(values)) {
		return args;
	}
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		const type = fieldTypes.get(name);
		if (typeof value === 'string' && (type === 'object' || type === 'array')) {
			const parsed = parseJson(value);
			if (parsed !== null && typeof parsed === 'object') {
				args[name] = parsed as IDataObject | IDataObject[];
				continue;
			}
		}
		args[name] = value;
	}
	return args;
}

/** Joins the text blocks of a tool result. */
export function toolText(content: unknown): string {
	return (Array.isArray(content) ? (content as unknown[]) : [])
		.filter(isDataObject)
		.filter((block) => block.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text as string)
		.join('\n\n');
}

function textOrNull(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

export async function runTool(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const tool = String(this.getNodeParameter('tool', itemIndex, '') ?? '').trim();
	if (tool === '') {
		throw new NodeOperationError(this.getNode(), 'Choose a tool to run', {
			itemIndex,
			description: 'Select a tool in Tool Name or ID, or enter its name with an expression',
		});
	}

	const inputMode = this.getNodeParameter('inputMode', itemIndex, 'fields') as string;
	const args =
		inputMode === 'json'
			? parseJsonObjectParameter.call(
					this,
					this.getNodeParameter('jsonArguments', itemIndex, '{}'),
					'Arguments (JSON)',
					itemIndex,
				)
			: buildToolArguments(
					this.getNodeParameter('toolArguments.value', itemIndex, {}),
					this.getNodeParameter('toolArguments.schema', itemIndex, []),
				);

	const result = await mcpRequest.call(
		this,
		'tools/call',
		{ name: tool, arguments: args },
		itemIndex,
	);
	const text = toolText(result.content);
	if (result.isError) {
		throw new NodeOperationError(this.getNode(), cleanCopy(text) || TOOL_ERROR_MESSAGE, {
			itemIndex,
		});
	}

	// A long job answers with its job ID and status, for the Job resource or the trigger.
	const structured = isDataObject(result.structuredContent) ? result.structuredContent : {};
	return [
		{
			json: {
				tool,
				text,
				result: structured,
				job_id: textOrNull(structured.job_id),
				status: textOrNull(structured.status),
			},
			pairedItem: { item: itemIndex },
		},
	];
}
