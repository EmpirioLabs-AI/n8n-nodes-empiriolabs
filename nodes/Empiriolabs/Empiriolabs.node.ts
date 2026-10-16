import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { textToSpeech, transcribe } from './actions/audio';
import { createChatCompletion } from './actions/chat';
import { createEmbedding } from './actions/embedding';
import { generateImage } from './actions/image';
import { getJob, getManyJobs } from './actions/job';
import { getManyModels } from './actions/model';
import { generateVideo } from './actions/video';
import { audioFields, audioOperations } from './descriptions/AudioDescription';
import { chatFields, chatOperations } from './descriptions/ChatDescription';
import { embeddingFields, embeddingOperations } from './descriptions/EmbeddingDescription';
import { imageFields, imageOperations } from './descriptions/ImageDescription';
import { jobFields, jobOperations } from './descriptions/JobDescription';
import { modelFields, modelOperations } from './descriptions/ModelDescription';
import { videoFields, videoOperations } from './descriptions/VideoDescription';
import {
	getChatModels,
	getEmbeddingModels,
	getImageModels,
	getModelCategories,
	getSpeechModels,
	getTranscriptionModels,
	getVideoModels,
	getVoices,
} from './methods/loadOptions';
import { searchJobs } from './methods/listSearch';

type OperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

const OPERATIONS: Record<string, Record<string, OperationHandler>> = {
	audio: { textToSpeech, transcribe },
	chat: { create: createChatCompletion },
	embedding: { create: createEmbedding },
	image: { generate: generateImage },
	job: { get: getJob, getAll: getManyJobs },
	model: { getAll: getManyModels },
	video: { generate: generateVideo },
};

export class Empiriolabs implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EmpirioLabs AI',
		name: 'empiriolabs',
		icon: { light: 'file:../../icons/empiriolabs.png', dark: 'file:../../icons/empiriolabs.png' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description:
			'Use EmpirioLabs AI models for chat, images, speech, transcription, video, and embeddings',
		defaults: {
			name: 'EmpirioLabs AI',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'empirioLabsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Embedding', value: 'embedding' },
					{ name: 'Image', value: 'image' },
					{ name: 'Job', value: 'job' },
					{ name: 'Model', value: 'model' },
					{ name: 'Video', value: 'video' },
				],
				default: 'chat',
			},
			...audioOperations,
			...audioFields,
			...chatOperations,
			...chatFields,
			...embeddingOperations,
			...embeddingFields,
			...imageOperations,
			...imageFields,
			...jobOperations,
			...jobFields,
			...modelOperations,
			...modelFields,
			...videoOperations,
			...videoFields,
		],
	};

	methods = {
		loadOptions: {
			getChatModels,
			getEmbeddingModels,
			getImageModels,
			getModelCategories,
			getSpeechModels,
			getTranscriptionModels,
			getVideoModels,
			getVoices,
		},
		listSearch: {
			searchJobs,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const handler = OPERATIONS[resource]?.[operation];
				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not available for the resource "${resource}"`,
						{ itemIndex },
					);
				}
				returnData.push(...(await handler.call(this, itemIndex)));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					// Errors from the shared request helper do not know which item they belong to.
					if (error.context.itemIndex === undefined) {
						error.context.itemIndex = itemIndex;
					}
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
