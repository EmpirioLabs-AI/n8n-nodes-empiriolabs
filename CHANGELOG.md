# Changelog

## 0.4.0

- New resource 3D Asset with the Generate operation (Generate a 3D asset): starts a 3D generation job from an image in a binary field or at a public URL and returns the job. With Wait for Completion on, the node waits for the job and downloads the 3D file as a binary file. Options: resolution, seed, texture size, target face count, remesh, maximum number of tokens.
- New resource Decision with the Create operation (Create a decision): answers yes or no, choice, score and tool questions about a text or a JSON value with a decision model and returns each answer with its probabilities and confidence. The questions are added with fields or entered as one JSON object.
- New resource Detection with the Detect AI Text operation (Detect text written by AI): checks whether a text was written by AI.
- New resource Rerank with the Rerank Documents operation (Rerank documents): sorts documents by relevance to a query with a reranking model and returns each ranked document as its own item with its score. Options: top N, instruction, return documents.
- New resource Voice with the Get Many operation (Get many voices): returns the voices of a text to speech model, with your custom voices, and the Delete operation (Delete a voice): deletes a custom voice.
- Audio: new Generate Music or Sound operation (Generate music or sound), which starts a music or sound effect job from a prompt and returns the job. With Wait for Completion on, the node waits for the job and downloads the audio as a binary file. Options: lyrics, duration, steps, prompt adherence, seed, output format.
- Image: new Edit operation (Edit an image), which changes an image at a public URL with a text instruction and returns the edited images as binary files; new Analyze operation (Analyze an image), which answers a question about an image from a binary field or a public URL; new Get Template and Get Many Templates operations for the image generation templates.
- Video: new Get Template and Get Many Templates operations for the video generation templates.
- Web Search: new Answer operation (Answer a question from the web), which returns an answer with its sources, and new Research operation (Research a question on the web), which returns a report with citations. The node waits for the report, with a timeout.
- Every new model list loads from the model catalog and shows the models that support the operation. The template lists and the list of custom voices load from the EmpirioLabs AI API.
- A long request that ends with an error now stops the node with the API's message, on every operation, instead of returning the error as data.
- The published package no longer includes image files other than the node icon.

## 0.3.0

- New resource Document with the Read operation (Read a document): reads a PDF or an image from a binary field or a public URL with a document OCR model and returns every page as Markdown, plus `text`, the whole document as one text. Options: pages, table format, header and footer extraction, image regions. A long document is read in the background and the node waits for it by default.
- New resource Web Search with the Search operation (Search the web): searches the web with a search model; each model's own fields go in Model Parameters (JSON).
- Removed the Tool resource of 0.2.0 (Run a tool). Document and Web Search call the EmpirioLabs AI API directly with typed fields instead.

## 0.2.0

- New resource Tool with the Run operation (Run a tool): runs any EmpirioLabs AI tool, such as reading a document, searching the web, or generating media. The tool list and each tool's arguments load live from EmpirioLabs AI, so new tools appear without a node update.
- Tool arguments can be entered in fields typed from the tool's definition, or as one JSON object.
- A tool that starts a long job returns its job ID and status, for Job > Get or the trigger.
- Built with `@n8n/node-cli` 0.54 and tested against `n8n-workflow` 2.45.

## 0.1.1

- Published from GitHub Actions through npm trusted publishing (OIDC), with provenance.
- README: link to the npm package.

## 0.1.0

- First release.
- EmpirioLabs AI node: Audio (Text to Speech, Transcribe), Chat (Create Completion), Embedding (Create), Image (Generate), Job (Get, Get Many), Model (Get Many), and Video (Generate).
- EmpirioLabs AI Trigger node: Job Finished.
- EmpirioLabs AI API credential with a bearer API key.
