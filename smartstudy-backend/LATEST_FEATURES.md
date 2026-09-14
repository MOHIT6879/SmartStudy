# Dynamic Model Routing & Integrations

## Overview
This update introduces a dynamic AI model routing system that intelligently selects the most appropriate model for OCR extraction and Reasoning evaluation based on the assignment's subject, language, and complexity.

## Features Implemented

### 1. Subject-Aware AI Reasoning Routing (`src/services/aiService.ts`)
- **Dynamic Selection**: The system now dynamically evaluates the complexity of a question paper to choose the best reasoning model (`gemini-2.5-flash`, `gemini-3.6-flash`, `gemini-3.6-standard`, or `gemini-3.6-pro`).
- **Indic Language Support**: For `Hindi` and `Telugu` subjects, the system bypasses Gemini and routes directly to the `sarvam` (or `chandra`) models for reasoning evaluation.

### 2. Subject-Aware OCR Extraction (`src/services/ocrService.ts`)
- **Math**: Routes to `gemini-3.6-flash` for high-precision mathematical OCR extraction.
- **Indic Languages (Hindi/Telugu)**: Routes to `sarvam` for OCR extraction.
- **Other Subjects (Science, Social, English)**: Defaults to `gemini-2.5-flash` for fast and efficient OCR.

### 3. Database Schema Changes & Graceful Fallbacks (`src/index.ts`)
- Introduced the `reasoning_model` field to the `assignments` creation payload to permanently store the chosen reasoning model for each assignment.
- **Graceful Fallback**: If the `reasoning_model` column does not exist in the Supabase schema yet, the system gracefully catches the database error and retries the insertion using the legacy schema. This prevents the application from crashing while awaiting manual database migrations.

## Action Required: Database Schema Update
> **Note:** To fully utilize the new features, you must run the following SQL command in your Supabase SQL Editor:
> ```sql
> ALTER TABLE assignments ADD COLUMN reasoning_model TEXT;
> ```

## Integration Testing (`tests/routing.test.ts`)
We have added a new automated integration testing suite in the `tests` directory to verify the routing algorithms and document ingestion pipeline without needing to spin up the entire server.

### Test Coverage
- Reasoning Model Routing (Telugu/Hindi -> `sarvam`)
- Reasoning Model Routing (Science -> Dynamic Gemini Model)
- OCR Model Routing (Math -> `gemini-3.6-flash`)
- OCR Model Routing (Hindi -> `sarvam`)
- Document Ingestion (Successfully parses and vectorizes sample PDFs like `Grade5_Science_Plant_Reproduction.txt`)

### How to Run the Tests
You can execute the test suite from the `smartstudy-backend` directory using `tsx`:

```bash
# Navigate to the backend directory
cd smartstudy-backend

# Run the test file using npx and tsx
npx tsx tests/routing.test.ts
```
