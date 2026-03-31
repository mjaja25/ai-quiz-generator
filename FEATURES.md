# AI Quiz Generator - Current Features

> **Project:** Dream Centre MCQ Generator
> **Stack:** Vanilla HTML/CSS/JS (Single-file SPA), Tailwind CSS, Netlify/Vercel Serverless Functions
> **AI Integration:** Google Gemini API
> **Live URL:** https://dream-centre-quiz.netlify.app

---

## 1. AI Quiz Generation

- Generate **1-20 MCQs** on any topic via Google Gemini AI
- Configurable **number of options** per question (2-6)
- **Three difficulty levels**: Easy, Medium, Hard
- **Additional instructions** free-text field (up to 300 chars)
- **Quick preset instruction chips**: Exam-style, Conceptual, Numerical, Previous year, Tricky
- **Custom quiz title** for PDF header
- Structured JSON prompt with `{ question, options, answer, explanation }`
- **Cancel generation** mid-request with abort button
- **Retry logic**: 30s timeout, 2 retries with increasing delay

## 2. Anti-Duplicate System

- **Upload previous quizzes** (JSON or PDF) as "questions to avoid"
- **Drag-and-drop upload zone** with click fallback
- Supports **multiple files** simultaneously
- **Chip-based file management** with per-file question count and individual removal
- **Clear all** button for avoid list
- **Deduplication** against existing avoid questions (case-insensitive)
- PDF parsing via lazy-loaded **pdf.js** (regex-based question extraction)
- JSON parsing supports array and `{ questions: [...] }` formats
- Avoid list **truncation at 3000 chars** with toast notification

## 3. Context-Aware Regeneration

- **Per-question regeneration** with partial DOM update (other edits preserved)
- **Regenerate all** with same settings
- Context includes neighboring questions for coherence
- **Cumulative rejection tracking** — rejected questions added to avoid list
- **Topic-aware rejection clearing** — changing topic resets reject history

## 4. Quiz Review & Editing

- **Editable question text** (auto-resizing textareas)
- **Editable option text** for each option
- **Editable answer** via dropdown + free-text field
- **Editable explanation** per question (collapsible, Q&A Key PDF only)
- **Delete individual questions** with undo support
- **Bulk delete selected** questions with undo support
- **Add blank questions** manually
- **Drag-to-reorder questions** (HTML5 drag and drop)
- **Select/deselect** individual questions with live count
- **Select All / Deselect All** toggle

## 5. Export & Download

### PDF Export (jsPDF)

- **Student Answer Sheet** — questions with blank answer circles, name/date/score fields
- **Questions PDF** — clean questions-only format
- **Q&A Key** — questions with answers (green) and explanations (italic)
- All PDFs include: "Dream Centre" header, date stamp, page numbers
- Unique filenames with topic name and date

### Word Export (docx)

- **Student Sheet (Word)** — questions with blank circles
- **Questions (Word)** — questions and options only
- **Q&A Key (Word)** — questions with answers and explanations
- `.docx` format with bold questions, colored answers, italic explanations

### PDF Settings (Collapsible)

- **Font size**: Small (9pt), Medium (11pt), Large (13pt)
- **Line spacing**: Compact, Normal, Wide
- **Question numbers**: Show/Hide toggle

### Text & Data Export

- **Copy as Text** — plain text to clipboard with numbered questions
- **Save Quiz (JSON)** — export quiz data as JSON file
- **Load Quiz (JSON)** — import previously saved JSON quiz files

## 6. Topic Suggestions & Autocomplete

- **76 pre-built topic suggestions** across categories:
  - Biology (15), Physics (11), Chemistry (5), Mathematics (10)
  - History (5), Civics (5), Economics (5), Computer Science (5)
  - Geography (5), Festivals (5), English (5)
- **Quick-start topic chips**: Photosynthesis, World War II, Quadratic Equations, Indian Constitution, Python Basics
- **Autocomplete dropdown** appears when typing 2+ characters
- Fuzzy matching, shows up to 6 suggestions

## 7. User Interface & Experience

### Theme System

- **Dark/Light mode toggle** (sun/moon icon)
- Theme **persisted** in localStorage

### Responsive Design

- Mobile-responsive layout with Tailwind CSS grid/flex
- Single column on small screens, multi-column on larger

### Form Persistence

- All form inputs **persisted in localStorage** across sessions
- Saved: topic, difficulty, numQuestions, numOptions, PDF settings, etc.

### Keyboard Shortcuts

- **Enter** on topic input — trigger generation
- **Ctrl+Enter** — generate questions
- **Ctrl+S** — save quiz as JSON
- **Ctrl+E** — export Q&A Key PDF

### Tooltips & Notifications

- **First-time user tooltips** on all interactive elements
- **Animated toast notifications** (auto-dismiss ~3s) with optional action buttons
- **Tab close warning** when quiz data exists (prevents accidental loss)

### Loading States

- Animated spinner during generation
- Status text updates (e.g., "Generating...", "Retrying... (attempt 2/3)")

### Easter Egg

- Triple-tap 'r' in "Generator" title to unlock **hidden AI model selection**

## 8. AI Model Selection (Hidden)

- **Default model**: `gemini-2.5-flash`
- Fallback models: Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, 2.0 Flash Lite
- **Dynamic model fetching** from Gemini API in production
- Only available after unlocking via Easter egg

## 9. Backend API (Serverless)

### Endpoints

| Method | Path                 | Description                           |
| ------ | -------------------- | ------------------------------------- |
| `POST` | `/api/generate-quiz` | Proxies requests to Google Gemini API |
| `GET`  | `/api/list-models`   | Lists available Gemini models         |

### Security & Validation

- API key stored as **environment variable** (never exposed to client)
- Input validation: prompt must be non-empty string, max 8,000 chars, max 20 questions
- Model validation: only accepts models starting with `gemini-`
- **CORS** restricted to allowed origins
- **25-second timeout** for upstream API calls

### Dual Deployment

- Netlify Functions (`netlify/functions/`) — CommonJS
- Vercel API Routes (`api/`) — ESM
- Both implementations are functionally identical

## 10. Testing

- **9 test cases** using Node.js built-in test runner
- Covers: method rejection, input validation, CORS handling, missing API key
- Run via `npm test`

## 11. CI/CD & Deployment

- **GitHub Actions CI** — triggers on push/PR to `main`
- Pipeline: `npm ci` → `npm run lint` → `npm test`
- Deployed to **Netlify** with `netlify.toml` configuration
- Environment variable `GEMINI_API_KEY` set in Netlify site settings

## 12. Code Quality

- **ESLint 9** flat config with separate configs for Netlify, Vercel, and tests
- Rules: `no-unused-vars`, `eqeqeq`, `no-var`, `prefer-const`
- **Prettier** for code formatting via `npm run format`

## 13. External Dependencies (CDN)

| Library      | Purpose                     |
| ------------ | --------------------------- |
| Tailwind CSS | Utility-first CSS framework |
| jsPDF        | PDF generation              |
| docx         | Word document generation    |
| pdf.js       | PDF parsing (lazy-loaded)   |
| Inter font   | Typography                  |

---

## Planned but Not Implemented

- OMR sheet generation & reader/grading system
- Student registration with payment (Google Sheets + UPI)
- Quiz template system
- Multiple question types (True/False, Fill-in-blank, Match-the-following)
- Multi-language support
- Batch quiz generation
- Quiz analytics dashboard
- Collaborative quiz editing
- Student-facing quiz mode
- Backend caching / cost control
