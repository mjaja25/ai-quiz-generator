# AI Quiz Generator

AI-powered MCQ generator for teachers. Generate, review, edit, and export printable quiz PDFs using Google Gemini.

## Features

### Generation

- Generate 1-20 multiple choice questions on any topic
- Customize number of options per question (2-6)
- Three difficulty levels: Easy, Medium, Hard
- Additional instructions field with quick presets (Exam-style, Conceptual, Numerical, Previous year, Tricky)
- Topic suggestion chips for quick starts
- Configurable quiz title for PDF header

### Review & Editing

- Inline editing of questions, options, and answers
- Answer dropdown selector (picks from available options)
- Per-question regeneration (AI replaces a single question)
- Regenerate all questions with same settings
- Delete individual questions
- Add blank questions manually
- Drag-to-reorder questions
- Select/deselect questions with live count ("3 of 5 selected")
- Cancel button during generation

### Export

- **Student Answer Sheet** — Questions with blank answer circles, name/date/score fields (for printing and handing out)
- **Questions PDF** — Clean questions-only PDF
- **Q&A Key PDF** — Questions with answer key (for teacher reference)
- **Copy as Text** — Plain text to clipboard
- **Save/Load JSON** — Save quiz to file, load it back later
- PDFs include date stamp, page numbers, and unique filenames

### Other

- Form inputs persist across browser sessions (localStorage)
- Warning before closing tab with unsaved quiz
- Enter key to generate from topic field
- Timeout + retry on API calls
- Mobile-responsive layout

## Prerequisites

- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd ai-quiz-generator

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

## Local Development

With [Netlify CLI](https://www.npmjs.com/package/netlify-cli):

```bash
npm install -g netlify-cli
netlify dev
```

This serves the frontend at `http://localhost:8888` and proxies the serverless function.

Alternatively, open `index.html` directly in a browser. You'll be prompted for your API key on each generation request.

## Deployment

1. Push to a GitHub repository
2. Connect the repo in [Netlify](https://app.netlify.com)
3. Set the environment variable `GEMINI_API_KEY` in Netlify's site settings
4. Deploy — Netlify auto-detects the `netlify.toml` config

## Environment Variables

| Variable         | Description                      |
| ---------------- | -------------------------------- |
| `GEMINI_API_KEY` | Google Gemini API key (required) |

## Scripts

| Command            | Description               |
| ------------------ | ------------------------- |
| `npm run lint`     | Run ESLint                |
| `npm run lint:fix` | Auto-fix ESLint issues    |
| `npm run format`   | Format code with Prettier |
| `npm test`         | Run tests                 |

## Project Structure

```
├── index.html                    # Frontend (single page app)
├── netlify/
│   └── functions/
│       ├── generate-quiz.js      # Serverless API proxy
│       └── generate-quiz.test.js # Tests
├── netlify.toml                  # Netlify config
├── eslint.config.mjs             # ESLint config
├── .github/workflows/ci.yml      # GitHub Actions CI
├── .env.example                  # Env var template
└── .gitignore
```
