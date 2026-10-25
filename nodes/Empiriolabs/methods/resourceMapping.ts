import type {
	FieldType,
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';

import { isDataObject, listTools } from '../transport';

const JSON_SCHEMA_TYPES: Record<string, FieldType> = {
	string: 'string',
	integer: 'number',
	number: 'number',
	boolean: 'boolean',
	array: 'array',
	object: 'object',
};

const WORD_CASING: Record<string, string> = {
	ai: 'AI',
	api: 'API',
	cfg: 'CFG',
	id: 'ID',
	ids: 'IDs',
	json: 'JSON',
	jsonl: 'JSONL',
	mime: 'MIME',
	ocr: 'OCR',
	tts: 'TTS',
	uri: 'URI',
	url: 'URL',
	urls: 'URLs',
};

// Guards against a schema that nests choices without end.
const MAX_SCHEMA_DEPTH = 8;

interface FieldShape {
	type: FieldType;
	options?: INodePropertyOptions[];
}

/** Turns an argument name such as "image_url" into a label such as "Image URL". */
export function humanize(name: string): string {
	const label = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[\s_-]+/)
		.filter((word) => word !== '')
		.map(
			(word) =>
				WORD_CASING[word.toLowerCase()] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
		)
		.join(' ');
	return label || name;
}

/** The JSON Schema types a schema allows besides null, so ["integer", "null"] reads as integer. */
function declaredTypes(schema: IDataObject): string[] {
	const types: unknown[] = Array.isArray(schema.type) ? schema.type : [schema.type];
	return types.filter((type): type is string => typeof type === 'string' && type !== 'null');
}

function allowsOnlyNull(schema: IDataObject): boolean {
	const types: unknown[] = Array.isArray(schema.type) ? schema.type : [schema.type];
	return types.length > 0 && types.every((type) => type === 'null');
}

function stringChoices(schema: IDataObject): string[] | undefined {
	if (!Array.isArray(schema.enum)) {
		return undefined;
	}
	const values = (schema.enum as unknown[]).filter((value) => value !== null);
	return values.length > 0 && values.every((value) => typeof value === 'string')
		? (values as string[])
		: undefined;
}

/**
 * One field for a value that can take several shapes: text when any shape is text, a list when
 * every shape is a list, a number or a switch when every shape is one, and JSON otherwise.
 */
function combinedShape(types: FieldType[]): FieldShape {
	if (types.some((type) => type === 'string' || type === 'options')) {
		return { type: 'string' };
	}
	for (const type of ['array', 'number', 'boolean'] as FieldType[]) {
		if (types.every((entry) => entry === type)) {
			return { type };
		}
	}
	return { type: 'object' };
}

/** Maps the JSON Schema of one tool argument to the type of its field. */
export function fieldShape(schema: unknown, depth = 0): FieldShape {
	const property = isDataObject(schema) ? schema : {};
	const variants = Array.isArray(property.anyOf)
		? property.anyOf
		: Array.isArray(property.oneOf)
			? property.oneOf
			: undefined;
	if (variants && depth < MAX_SCHEMA_DEPTH) {
		const shapes = (variants as unknown[])
			.filter(isDataObject)
			.filter((variant) => !allowsOnlyNull(variant));
		if (shapes.length === 1) {
			return fieldShape(shapes[0], depth + 1);
		}
		if (shapes.length > 1) {
			return combinedShape(shapes.map((variant) => fieldShape(variant, depth + 1).type));
		}
	}

	const types = declaredTypes(property);
	const choices = stringChoices(property);
	if (choices && types.every((type) => type === 'string')) {
		return { type: 'options', options: choices.map((value) => ({ name: value, value })) };
	}
	if (types.length > 1) {
		return combinedShape(types.map((type) => JSON_SCHEMA_TYPES[type] ?? 'string'));
	}
	if (types.length === 1) {
		return { type: JSON_SCHEMA_TYPES[types[0]] ?? 'string' };
	}
	if (isDataObject(property.properties)) {
		return { type: 'object' };
	}
	if (property.items !== undefined) {
		return { type: 'array' };
	}
	return { type: 'string' };
}

/** Maps every argument in a tool's input schema to a field, in the order the tool lists them. */
export function toolFields(tool: IDataObject): ResourceMapperField[] {
	const schema = isDataObject(tool.inputSchema) ? tool.inputSchema : {};
	const properties = isDataObject(schema.properties) ? schema.properties : {};
	const required = new Set(
		Array.isArray(schema.required)
			? (schema.required as unknown[]).filter((name) => typeof name === 'string')
			: [],
	);

	return Object.entries(properties).map(([name, property]) => {
		const shape = fieldShape(property);
		const field: ResourceMapperField = {
			id: name,
			displayName: humanize(name),
			required: required.has(name),
			defaultMatch: false,
			canBeUsedToMatch: false,
			display: true,
			type: shape.type,
		};
		if (shape.options) {
			field.options = shape.options;
		}
		if (shape.type === 'boolean') {
			// A switch starts at the tool's own default, or unset so that nothing is sent.
			const fallback = isDataObject(property) ? property.default : undefined;
			field.defaultValue = typeof fallback === 'boolean' ? fallback : null;
		}
		return field;
	});
}

/** Lists the arguments of the chosen tool as fields, read from the live tool list. */
export async function getToolFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const name = this.getCurrentNodeParameter('tool');
	if (typeof name !== 'string' || name === '' || name.startsWith('=')) {
		return { fields: [] };
	}

	const tool = (await listTools.call(this)).find((entry) => entry.name === name);
	if (!tool) {
		return {
			fields: [],
			emptyFieldsNotice: 'This tool is not available any more. Choose another tool.',
		};
	}
	const fields = toolFields(tool);
	return fields.length > 0
		? { fields }
		: { fields, emptyFieldsNotice: 'This tool takes no arguments.' };
}
