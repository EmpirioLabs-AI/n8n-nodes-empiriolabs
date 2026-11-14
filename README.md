# n8n-nodes-empiriolabs

This is an n8n community node package. It lets you use [EmpirioLabs AI](https://empiriolabs.ai) in your n8n workflows for chat, image generation, editing and analysis, text to speech, music and sound generation, transcription, video generation, 3D generation, embeddings, reranking, decisions, AI text detection, document reading (OCR), web search, and web research. It can also start a workflow when a generation job finishes.

EmpirioLabs AI is a specialized AI inference and integration provider. It self-hosts open-source models on GPU infrastructure it manages, runs optimized endpoints for proprietary models, helps teams ship their own models to large audiences, and offers on-demand GPU Cloud instances and hosted AI agents. Its model catalog covers text, image, audio, video, transcription, embedding, reranking, research, and 3D models.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Trigger](#trigger)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Development](#development)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install the package `n8n-nodes-empiriolabs`.

## Operations

The **EmpirioLabs AI** node supports these resources and operations. Every model list loads live from the EmpirioLabs AI model catalog and shows only the models that support the selected operation.

| Resource | Operation | What it does |
| --- | --- | --- |
| 3D Asset | Generate | Starts a 3D generation job from an image, given as a binary file in the input item or as a public HTTPS URL, and returns the job. Turn on **Wait for Completion** to wait for the 3D asset, with a timeout, and download it as a binary file. Options include resolution, seed, texture size, and target face count, on models that support them. |
| Audio | Generate Music or Sound | Starts a music or sound effect job from a prompt and returns the job. Turn on **Wait for Completion** to wait for the audio, with a timeout, and download it as a binary file. Options include lyrics, duration, output format, and seed, on models that support them. |
| Audio | Text to Speech | Turns text into speech and returns the audio as a binary file. Choose a model, a voice the model offers, and optionally a language and output format. |
| Audio | Transcribe | Turns speech into text from a binary file in the input item or from a public HTTPS file URL. Waits for the transcript by default and returns the text, language, and duration. |
| Chat | Create Completion | Sends a prompt (with an optional system message) or a full conversation to a chat model and returns the reply. Options include temperature, maximum number of tokens, top P, and JSON output. |
| Decision | Create | Answers questions about a text or a JSON value with a decision model and returns each answer with its probabilities and a confidence value. A question can be yes or no, a choice between named options, a score on an ordered scale, or the choice of a function to call. Add the questions with fields, or enter them as one JSON object. A JSON value can hold images, audio, and video. |
| Detection | Detect AI Text | Checks whether a text was written by AI and returns the scores for the whole text and for each sentence. |
| Document | Read | Reads a PDF or an image (PNG, JPEG, WebP, TIFF, BMP, GIF or AVIF) from a binary file in the input item or from a public HTTPS URL, and returns every page as Markdown, plus `text`, the whole document as one Markdown text. Options choose pages, move tables, headers and footers into their own fields, and return image regions. A long document is read in the background, and the node waits for it by default. |
| Embedding | Create | Returns the embedding vector for a text. |
| Image | Analyze | Asks a question about an image, given as a binary file in the input item or as a public HTTPS URL, and returns the answer as text. Use it to describe an image, read the text in it, or answer a question about what it shows. |
| Image | Edit | Changes an image at a public HTTPS URL with a text instruction and returns each edited image as a binary file in its own item. Takes several image URLs on models that support it. Waits for the result by default, and returns the job when **Wait for Completion** is off. |
| Image | Generate | Creates images from a prompt and returns each image as a binary file in its own item. Options include aspect ratio, resolution, number of images, and reference image URLs for editing. |
| Image | Get Many Templates | Returns image generation templates, optionally filtered by category, by model, or to featured templates. |
| Image | Get Template | Returns one image generation template, with its recommended model, supported models, default parameters, and required inputs. |
| Job | Get | Returns the status and result of a job. Can also download the finished file as binary data. |
| Job | Get Many | Returns recent jobs, optionally filtered by status. |
| Model | Get Many | Returns models from the catalog, optionally filtered by category or search text. |
| Rerank | Rerank Documents | Sorts documents by how relevant they are to a query and returns each ranked document as its own item, most relevant first, with its relevance score, its text, and its position in the documents sent. Add the documents with fields, or pass a list as JSON. Options include the number of top documents to return and a custom instruction. |
| Video | Generate | Starts a video generation job and returns the job. Turn on **Wait for Completion** to wait for the video, with a timeout, and download it as a binary file. |
| Video | Get Many Templates | Returns video generation templates, optionally filtered by category, by model, or to featured templates. |
| Video | Get Template | Returns one video generation template, with its recommended model, supported models, default parameters, and required inputs. |
| Voice | Delete | Deletes one of your custom voices on a text to speech model. This cannot be undone. |
| Voice | Get Many | Returns the voices of a text to speech model, including your custom voices. Filters include type, language, gender, pitch, and search text, on models that support them. |
| Web Search | Answer | Answers a question from the web with an answer model and returns the answer with the sources it cites. |
| Web Search | Research | Researches a question on the web with a research model and returns a report with citations and its sources. A report can take several minutes, and the node waits for it, with a timeout. Options include the citation format and the research depth. |
| Web Search | Search | Searches the web with a search model and returns its answer: results with titles, URLs and snippets, an answer, or both, depending on the model. Each model's own fields, such as the number of results, go in **Model Parameters (JSON)**. |

Operations that create content also accept **Model Parameters (JSON)**: extra request fields for the selected model, such as `{"seed": 42}`. Each model lists the fields it accepts on its page in the [model catalog](https://docs.empiriolabs.ai/models-pricing).

The template lists load live from EmpirioLabs AI, and the Voice > Delete list shows your custom voices on the selected model.

The node can be used as a tool by the n8n AI Agent.

## Trigger

The **EmpirioLabs AI Trigger** node polls your recent jobs and starts the workflow when a job finishes.

- **Event:** Job Finished.
- **Statuses:** Completed, Failed, or Cancelled. Completed and Failed are selected by default.
- **Filters:** job type (image, video, music and sound, speech, transcription, or 3D generation) and model ID.

Each finished job starts the workflow once. When you activate the workflow, jobs that already finished are skipped. The jobs list covers the last hour, so keep the poll interval under an hour. When you test the trigger in the editor, it returns the most recent finished job.

## Credentials

The nodes authenticate with an EmpirioLabs AI API key.

1. Sign in or create an account at [platform.empiriolabs.ai](https://platform.empiriolabs.ai).
2. Open [API Keys](https://platform.empiriolabs.ai/dashboard/api-keys) in the dashboard and create a key. Keys start with `sk-empiriolabs-`.
3. In n8n, create a new **EmpirioLabs AI API** credential and paste the key into **API Key**.

n8n checks the key with a request to `GET https://api.empiriolabs.ai/v1/account/usage?limit=1`, which does not use credits. Requests that run models use the credits on your account; prices are listed on the [pricing page](https://empiriolabs.ai/pricing). See [Authentication](https://docs.empiriolabs.ai/authentication) for more about API keys.

## Compatibility

Built with the n8n node CLI (`@n8n/node-cli` 0.54) and tested against `n8n-workflow` 2.45. The package has no runtime dependencies.

## Usage

- **Choosing a model:** each model list shows the models whose catalog entry supports the selected operation. To set a model by ID instead, switch the field to **Expression** and enter an ID from the [models page](https://empiriolabs.ai/models).
- **Voices:** the Voice list shows the voices the selected text to speech model offers. **Model Default** uses the default voice of the model. Voice > Get Many returns the whole voice list of a model, with your custom voices. To speak with one of them, switch the Voice field to **Expression** and enter its ID. A model that takes voice IDs in another field names that field on its page in the model catalog: send it in **Model Parameters (JSON)**.
- **Templates:** Get Many Templates and Get Template return the image and video generation templates with their IDs. To apply one, enter its ID as `template` in **Model Parameters (JSON)** of Image > Generate or Video > Generate, for example `{"template": "TEMPLATE_ID"}`, and choose a model the template supports.
- **Binary files:** images, speech, and downloaded videos, music, and 3D files are returned in the binary field `data`. Change it with **Put Output in Field**. For transcription, document reading, image analysis, and 3D generation, set **Input Data Field Name** to the binary field that holds the file.
- **Long jobs:** video, 3D, and music and sound generation run as jobs. Video generation usually takes 1 to 15 minutes. Either turn on **Wait for Completion** and set a timeout, or keep the default, which returns the job right away, and continue with the Job resource or the trigger. Job results are kept for one hour after the job finishes.
- **Generated file links expire 7 days after they are created.** Download a file you want to keep, for example with the download options on the Video, Audio, 3D Asset, and Job resources.
- **Errors:** the node shows the message returned by the API, such as an unsupported parameter for the selected model. Turn on **Continue On Fail** in the node settings to keep the workflow running and return the message in the item instead.

## Development

```sh
npm install
npm run build        # compile to dist/
npm run lint         # n8n community node lint rules
npm test             # offline unit tests with a mocked n8n context
npm run scan:local   # the lint passes of @n8n/scan-community-package, run locally
npm run dev          # start n8n with this package loaded at http://localhost:5678
```

`npm run scan:local` installs `@n8n/scan-community-package` into `.scan/` and runs its two lint passes against the source and against the files `npm pack` would publish. The published scan, `npx @n8n/scan-community-package n8n-nodes-empiriolabs`, also checks npm provenance, so it can only pass after a version is published from GitHub Actions.

The live smoke test is skipped unless you opt in. It runs the credential test and one short chat completion on the cheapest chat model in the catalog, which uses a small amount of credit:

```sh
EMPIRIOLABS_LIVE=1 EMPIRIOLABS_API_KEY=sk-empiriolabs-... npm run test:live
```

Set `EMPIRIOLABS_LIVE_MODEL` to choose the chat model.

### Releasing

Versions are published to npm with a provenance statement by the [Publish workflow](.github/workflows/publish.yml) when a version tag such as `0.1.0` is pushed. Run `npm run release` to bump the version, update the changelog, tag, and push.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [EmpirioLabs AI documentation](https://docs.empiriolabs.ai/getting-started)
- [EmpirioLabs AI API reference](https://docs.empiriolabs.ai/api-reference-overview)
- [EmpirioLabs AI models](https://empiriolabs.ai/models)
- [npm package](https://www.npmjs.com/package/n8n-nodes-empiriolabs)
- Support: [support@empiriolabs.ai](mailto:support@empiriolabs.ai)

## Version history

### 0.4.0

New resources 3D Asset (Generate), Decision (Create), Detection (Detect AI Text), Rerank (Rerank Documents), and Voice (Get Many, Delete). New operations on the existing resources: Audio (Generate Music or Sound), Image (Edit, Analyze, Get Template, Get Many Templates), Video (Get Template, Get Many Templates), and Web Search (Answer, Research). Each calls the EmpirioLabs AI API directly with typed fields.

### 0.3.0

New Document resource (Read: a PDF or an image as Markdown) and Web Search resource (Search), each calling the EmpirioLabs AI API directly with typed fields. They replace the Tool resource of 0.2.0, which is removed.

### 0.2.0

New Tool resource with the Run operation (Run a tool), which runs any EmpirioLabs AI tool. The tool list and each tool's arguments load live from EmpirioLabs AI, so new tools appear without a node update.

### 0.1.1

Published from GitHub Actions through npm trusted publishing, with provenance. The README links the npm package.

### 0.1.0

First release: Audio (Text to Speech, Transcribe), Chat (Create Completion), Embedding (Create), Image (Generate), Job (Get, Get Many), Model (Get Many), Video (Generate), and the Job Finished trigger.

## License

[MIT](LICENSE.md)
