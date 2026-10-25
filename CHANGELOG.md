# Changelog

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
