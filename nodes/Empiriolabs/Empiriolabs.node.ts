import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { generateAudio, textToSpeech, transcribe } from './actions/audio';
import { createChatCompletion } from './actions/chat';
import { createDecision } from './actions/decision';
import { detectText } from './actions/detection';
import { readDocument } from './actions/document';
import { createEmbedding } from './actions/embedding';
import {
	analyzeImage,
	editImage,
	generateImage,
	getImageTemplate,
	getManyImageTemplates,
} from './actions/image';
import { getJob, getManyJobs } from './actions/job';
import { getManyModels } from './actions/model';
import { rerankDocuments } from './actions/rerank';
import { answerWeb, researchWeb, searchWeb } from './actions/search';
import { generateThreeD } from './actions/threeD';
import { generateVideo, getManyVideoTemplates, getVideoTemplate } from './actions/video';
import { deleteVoice, getManyVoices } from './actions/voice';
import { audioFields, audioOperations } from './descriptions/AudioDescription';
import { chatFields, chatOperations } from './descriptions/ChatDescription';
import { decisionFields, decisionOperations } from './descriptions/DecisionDescription';
import { detectionFields, detectionOperations } from './descriptions/DetectionDescription';
import { documentFields, documentOperations } from './descriptions/DocumentDescription';
import { embeddingFields, embeddingOperations } from './descriptions/EmbeddingDescription';
import { imageFields, imageOperations } from './descriptions/ImageDescription';
import { jobFields, jobOperations } from './descriptions/JobDescription';
import { modelFields, modelOperations } from './descriptions/ModelDescription';
import { rerankFields, rerankOperations } from './descriptions/RerankDescription';
import { searchFields, searchOperations } from './descriptions/SearchDescription';
import { threeDFields, threeDOperations } from './descriptions/ThreeDDescription';
import { videoFields, videoOperations } from './descriptions/VideoDescription';
import { voiceFields, voiceOperations } from './descriptions/VoiceDescription';
import {
	getAnswerModels,
	getAudioGenerationModels,
	getChatModels,
	getDecisionModels,
	getDetectionModels,
	getDocumentModels,
	getEmbeddingModels,
	getImageEditModels,
	getImageModels,
	getImageTemplates,
	getModelCategories,
	getRerankModels,
	getResearchModels,
	getSearchModels,
	getSpeechModels,
	getThreeDModels,
	getTranscriptionModels,
	getVideoModels,
	getVideoTemplates,
	getVisionModels,
	getVoiceModels,
	getVoices,
} from './methods/loadOptions';
import { searchCustomVoices, searchJobs } from './methods/listSearch';

type OperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

const OPERATIONS: Record<string, Record<string, OperationHandler>> = {
	audio: { generate: generateAudio, textToSpeech, transcribe },
	chat: { create: createChatCompletion },
	decision: { create: createDecision },
	detection: { detect: detectText },
	document: { read: readDocument },
	embedding: { create: createEmbedding },
	image: {
		analyze: analyzeImage,
		edit: editImage,
		generate: generateImage,
		getAllTemplates: getManyImageTemplates,
		getTemplate: getImageTemplate,
	},
	job: { get: getJob, getAll: getManyJobs },
	model: { getAll: getManyModels },
	rerank: { rerank: rerankDocuments },
	threeD: { generate: generateThreeD },
	video: {
		generate: generateVideo,
		getAllTemplates: getManyVideoTemplates,
		getTemplate: getVideoTemplate,
	},
	voice: { delete: deleteVoice, getAll: getManyVoices },
	webSearch: { answer: answerWeb, research: researchWeb, search: searchWeb },
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
			'Use EmpirioLabs AI models for chat, images, speech, music, transcription, video, 3D, embeddings, reranking, decisions, document reading, and web search',
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
					{ name: '3D Asset', value: 'threeD' },
					{ name: 'Audio', value: 'audio' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Decision', value: 'decision' },
					{ name: 'Detection', value: 'detection' },
					{ name: 'Document', value: 'document' },
					{ name: 'Embedding', value: 'embedding' },
					{ name: 'Image', value: 'image' },
					{ name: 'Job', value: 'job' },
					{ name: 'Model', value: 'model' },
					{ name: 'Rerank', value: 'rerank' },
					{ name: 'Video', value: 'video' },
					{ name: 'Voice', value: 'voice' },
					{ name: 'Web Search', value: 'webSearch' },
				],
				default: 'chat',
			},
			...audioOperations,
			...audioFields,
			...chatOperations,
			...chatFields,
			...decisionOperations,
			...decisionFields,
			...detectionOperations,
			...detectionFields,
			...documentOperations,
			...documentFields,
			...embeddingOperations,
			...embeddingFields,
			...imageOperations,
			...imageFields,
			...jobOperations,
			...jobFields,
			...modelOperations,
			...modelFields,
			...rerankOperations,
			...rerankFields,
			...threeDOperations,
			...threeDFields,
			...videoOperations,
			...videoFields,
			...voiceOperations,
			...voiceFields,
			...searchOperations,
			...searchFields,
		],
	};

	methods = {
		loadOptions: {
			getAnswerModels,
			getAudioGenerationModels,
			getChatModels,
			getDecisionModels,
			getDetectionModels,
			getDocumentModels,
			getEmbeddingModels,
			getImageEditModels,
			getImageModels,
			getImageTemplates,
			getModelCategories,
			getRerankModels,
			getResearchModels,
			getSearchModels,
			getSpeechModels,
			getThreeDModels,
			getTranscriptionModels,
			getVideoModels,
			getVideoTemplates,
			getVisionModels,
			getVoiceModels,
			getVoices,
		},
		listSearch: {
			searchCustomVoices,
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
