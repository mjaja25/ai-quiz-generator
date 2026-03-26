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
- Context-aware regeneration — when replacing a single question, the AI sees neighboring questions for coherence
- Cumulative rejection tracking — each regenerate click adds the rejected question to the avoid list, so the AI never repeats it

### Anti-Duplicate

- Upload previously exported quizzes (JSON or PDF) as "questions to avoid"
- Drag-and-drop or click-to-upload zone, supports multiple files
- Uploaded questions are sent to the AI so it avoids generating similar questions
- Chip-based file management with per-file question count and individual removal
- pdf.js loaded lazily on first upload — doesn't slow down page load

### Review & Editing

- Inline editing of questions, options, and answers
- Editable answer dropdown (picks from available options) plus free-text answer field
- Per-question regenerate with partial DOM update (other cards' edits are preserved)
- Regenerate all with same settings
- Delete individual questions
- Add blank questions manually
- Drag-to-reorder questions
- Select/deselect questions with live count ("3 of 5 selected")
- Editable explanation field per question (collapsible, shown only in Q&A Key PDF)
- Cancel button during generation

### Export

- **Student Answer Sheet** — Questions with blank answer circles, name/date/score fields (for printing and handing out)
- **Questions PDF** — Clean questions-only PDF
- **Q&A Key PDF** — Questions with answers and explanations (for teacher reference)
- **Copy as Text** — Plain text to clipboard
- **Save/Load JSON** — Save quiz to file, load it back later (also compatible with the anti-duplicate upload)
- PDFs include date stamp, page numbers, and unique filenames with topic name

### UX

- Form inputs persist across browser sessions (localStorage)
- Warning before closing tab with unsaved quiz
- Enter key to generate from topic field
- Timeout + retry on API calls
- Tooltips for first-time users on all interactive elements
- Mobile-responsive layout
- Topic-aware rejection clearing — changing the topic resets the reject history

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
│       └── generate-quiz.js      # Serverless API proxy
├── tests/
│   └── generate-quiz.test.js     # Tests
├── netlify.toml                  # Netlify config
├── eslint.config.mjs             # ESLint config
├── .github/workflows/ci.yml      # GitHub Actions CI
├── .env.example                  # Env var template
├── ROADMAP.md                    # Future upgrade plans
└── .gitignore
```
