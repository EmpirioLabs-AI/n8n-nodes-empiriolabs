import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest, isDataObject, parseJsonObjectParameter } from '../transport';

export function buildChatMessages(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): IDataObject[] {
	const inputType = this.getNodeParameter('inputType', itemIndex, 'prompt') as string;

	if (inputType === 'messages') {
		const values = this.getNodeParameter('messages.values', itemIndex, []) as IDataObject[];
		const messages = values
			.filter((message) => typeof message.content === 'string' && message.content !== '')
			.map((message) => ({ role: message.role ?? 'user', content: message.content }));
		if (messages.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one message with content', {
				itemIndex,
				description: 'Use Add Message in the Messages parameter, or switch Input Type to Prompt',
			});
		}
		return messages;
	}

	const prompt = this.getNodeParameter('prompt', itemIndex) as string;
	const messages: IDataObject[] = [];
	if (typeof options.systemMessage === 'string' && options.systemMessage !== '') {
		messages.push({ role: 'system', content: options.systemMessage });
	}
	messages.push({ role: 'user', content: prompt });
	return messages;
}

export function buildChatBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const messages = buildChatMessages.call(this, itemIndex, options);

	const optional: IDataObject = {};
	if (typeof options.temperature === 'number') {
		optional.temperature = options.temperature;
	}
	if (typeof options.maxTokens === 'number') {
		optional.max_tokens = options.maxTokens;
	}
	if (typeof options.topP === 'number') {
		optional.top_p = options.topP;
	}
	if (options.responseFormat === 'json_object') {
		optional.response_format = { type: 'json_object' };
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	return { ...optional, ...extra, model, messages, stream: false };
}

export function simplifyChatResponse(response: IDataObject): IDataObject {
	const choices = Array.isArray(response.choices) ? response.choices : [];
	const choice = isDataObject(choices[0]) ? choices[0] : {};
	const message = isDataObject(choice.message) ? choice.message : {};

	const simplified: IDataObject = {
		content: message.content ?? '',
	};
	const reasoning = message.reasoning_content ?? message.reasoning;
	if (reasoning !== undefined && reasoning !== null && reasoning !== '') {
		simplified.reasoning = reasoning;
	}
	if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
		simplified.tool_calls = message.tool_calls;
	}
	simplified.finish_reason = choice.finish_reason;
	simplified.model = response.model;
	simplified.usage = response.usage;
	simplified.id = response.id;
	return simplified;
}

export async function createChatCompletion(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildChatBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/chat/completions', body);
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

	return [
		{
			json: simplify ? simplifyChatResponse(response) : response,
			pairedItem: { item: itemIndex },
		},
	];
}
