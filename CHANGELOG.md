# Changelog

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
