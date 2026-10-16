import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class EmpirioLabsApi implements ICredentialType {
	name = 'empirioLabsApi';

	displayName = 'EmpirioLabs AI API';

	icon: Icon = { light: 'file:../icons/empiriolabs.png', dark: 'file:../icons/empiriolabs.png' };

	documentationUrl =
		'https://github.com/EmpirioLabs-AI/n8n-nodes-empiriolabs?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create an API key in the EmpirioLabs AI dashboard under API Keys',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.empiriolabs.ai/v1',
			url: '/account/usage',
			method: 'GET',
			qs: {
				limit: 1,
			},
		},
	};
}
