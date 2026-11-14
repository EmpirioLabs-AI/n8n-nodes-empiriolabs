import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest, isDataObject, readJsonParameter, splitLines } from '../transport';

/** The question types, with the name each has in the Questions parameter. */
const QUESTION_TYPES: Array<{ type: string; label: string }> = [
	{ type: 'noul', label: 'Yes or No' },
	{ type: 'choice', label: 'Choice' },
	{ type: 'score', label: 'Score' },
	{ type: 'tool', label: 'Tool' },
];

/**
 * The options of a choice question, one per line: a name, or a name and its description
 * separated by the first colon. An option without a description has the value null.
 */
export function parseChoiceOptions(value: unknown): IDataObject {
	const criteria: IDataObject = {};
	for (const line of splitLines(value)) {
		const separator = line.indexOf(':');
		const name = (separator === -1 ? line : line.slice(0, separator)).trim();
		const description = separator === -1 ? '' : line.slice(separator + 1).trim();
		if (name !== '') {
			criteria[name] = description === '' ? null : description;
		}
	}
	return criteria;
}

function questionFromFields(
	this: IExecuteFunctions,
	type: string,
	entry: IDataObject,
	id: string,
	itemIndex: number,
): IDataObject {
	const instructions = typeof entry.instructions === 'string' ? entry.instructions.trim() : '';
	if (instructions === '') {
		throw new NodeOperationError(this.getNode(), `The question "${id}" has no instructions`, {
			itemIndex,
			description: 'Enter the question to answer in Instructions',
		});
	}
	const question: IDataObject = { type, instructions };

	if (type === 'choice') {
		const criteria = parseChoiceOptions(entry.choices);
		if (Object.keys(criteria).length < 2) {
			throw new NodeOperationError(
				this.getNode(),
				`The question "${id}" needs at least two options`,
				{ itemIndex, description: 'Enter one option per line in Options' },
			);
		}
		question.criteria = criteria;
	} else if (type === 'score') {
		const levels = splitLines(entry.levels);
		if (levels.length < 2) {
			throw new NodeOperationError(
				this.getNode(),
				`The question "${id}" needs at least two levels`,
				{ itemIndex, description: 'Enter one level per line in Levels' },
			);
		}
		question.criteria = levels;
	} else if (type === 'tool') {
		const tools = readJsonParameter(entry.tools);
		if (!Array.isArray(tools) || tools.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				`The question "${id}" needs at least one function`,
				{
					itemIndex,
					description: 'Enter a JSON array of function definitions in Functions (JSON)',
				},
			);
		}
		question.tools = tools as IDataObject[];
		if (entry.allowNone === false) {
			question.allow_none = false;
		}
	} else {
		const criteria: IDataObject = {};
		if (typeof entry.yesCriteria === 'string' && entry.yesCriteria.trim() !== '') {
			criteria.true = entry.yesCriteria.trim();
		}
		if (typeof entry.noCriteria === 'string' && entry.noCriteria.trim() !== '') {
			criteria.false = entry.noCriteria.trim();
		}
		if (Object.keys(criteria).length > 0) {
			question.criteria = criteria;
		}
	}

	if (type !== 'tool' && entry.abstain === true) {
		question.abstain = true;
	}
	return question;
}

export function buildDecisionQuestions(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const mode = this.getNodeParameter('questionsMode', itemIndex, 'fields') as string;

	if (mode === 'json') {
		const questions = readJsonParameter(this.getNodeParameter('questionsJson', itemIndex, ''));
		if (!isDataObject(questions) || Object.keys(questions).length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Questions (JSON) must be a JSON object with at least one question',
				{
					itemIndex,
					description:
						'Enter an object such as {"is_urgent": {"type": "noul", "instructions": "Does the customer need a resolution today?"}}',
				},
			);
		}
		return questions;
	}

	const sections = this.getNodeParameter('questions', itemIndex, {}) as IDataObject;
	const questions: IDataObject = {};
	for (const { type, label } of QUESTION_TYPES) {
		const entries = isDataObject(sections) && Array.isArray(sections[type]) ? sections[type] : [];
		for (const entry of (entries as unknown[]).filter(isDataObject)) {
			const id = typeof entry.id === 'string' ? entry.id.trim() : '';
			if (id === '') {
				throw new NodeOperationError(this.getNode(), `A ${label} question has no ID`, {
					itemIndex,
					description: 'Enter a name for the question in ID, such as is_urgent',
				});
			}
			if (questions[id] !== undefined) {
				throw new NodeOperationError(
					this.getNode(),
					`The question ID "${id}" is used more than once`,
					{ itemIndex, description: 'Give every question its own ID' },
				);
			}
			questions[id] = questionFromFields.call(this, type, entry, id, itemIndex);
		}
	}

	if (Object.keys(questions).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one question', {
			itemIndex,
			description: 'Use Add Question in the Questions parameter',
		});
	}
	return questions;
}

export function buildDecisionState(this: IExecuteFunctions, itemIndex: number): unknown {
	const stateType = this.getNodeParameter('stateType', itemIndex, 'text') as string;
	if (stateType !== 'json') {
		return this.getNodeParameter('stateText', itemIndex) as string;
	}
	const state = readJsonParameter(this.getNodeParameter('stateJson', itemIndex, ''));
	if (!isDataObject(state) && !Array.isArray(state)) {
		throw new NodeOperationError(this.getNode(), 'State (JSON) must be a JSON object or array', {
			itemIndex,
			description: 'Enter an object such as {"message": "I was charged twice this month."}',
		});
	}
	return state;
}

export function buildDecisionBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const body: IDataObject = {
		model,
		state: buildDecisionState.call(this, itemIndex) as IDataObject,
		questions: buildDecisionQuestions.call(this, itemIndex),
	};
	if (typeof options.longContext === 'string' && options.longContext !== '') {
		body.long_context = options.longContext;
	}
	return body;
}

/**
 * Answers typed questions about a state with a decision model. The output is the API's
 * answer: `answers`, keyed by the question IDs, each with its probabilities and confidence.
 */
export async function createDecision(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildDecisionBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/decisions', body);
	return [{ json: response, pairedItem: { item: itemIndex } }];
}
