# AI Quiz Generator — Upgrade Roadmap

## Minor Upgrades

Small, low-risk improvements to existing features.

### 1. Undo button

- Teacher accidentally deletes a question -> "Undo" toast appears for 5 seconds
- Store `lastDeletedQuestion` in state, restore on click

### 2. Keyboard shortcuts

- `Ctrl+Enter` -> generate from anywhere
- `Ctrl+S` -> save JSON
- `Ctrl+E` -> export PDF

### 3. Word export (.docx)

- Many Indian teachers work in Word, not PDF
- Libraries: `docx` (npm) or `html-docx-js`
- Same 3 export modes: Student Sheet, Questions, Q&A Key

### 4. Auto-expand topic suggestions

- Generate topic suggestions from the AI based on the subject
- Or allow teacher to save their own topic presets

### 5. Bulk delete questions

- "Delete Selected" button in results header
- Teacher can remove wrong questions before export

### 6. PDF layout customization

- Let teacher choose font size, spacing, and whether to show question numbers
- Small dropdown in the form or a gear icon in the export section

### 7. Mobile keyboard handling

- On mobile, scroll the focused textarea into view on `focus` event
- Prevent keyboard from covering the editing area

### 8. Toast for oversized avoid list

- When uploaded avoid list exceeds 3000-char budget, show a warning
- "Only the first X of Y questions will be included due to token limits"

### 9. Quiz metadata in JSON export

- Add subject, grade level, teacher name fields to export
- Makes it easier for schools to organize quiz files

### 10. Dark/Light mode toggle

- Simple CSS variable switch
- Teacher preference, some prefer light mode for projector display

---

## Major Upgrades

Significant features requiring new dependencies, architecture changes, or substantial work.

### 1. Multiple question types

- Add True/False, Fill-in-the-blank, Match-the-following alongside MCQ
- Requires: new UI sections per type, new PDF rendering per type, prompt engineering per type
- Impact: doubles the export/render code

### 2. Batch quiz generation

- Generate multiple topic quizzes in one session
- Teacher enters 5 topics, gets 5 separate quizzes as a single PDF
- Requires: queuing system, multi-PDF merge, progress indicator

### 3. AI model selection

- Choose between Gemini Flash, Gemini Pro, or other models
- Different speed/quality/cost tradeoffs
- Requires: backend changes, model parameter in request, cost warnings

### 4. Quiz template system

- Teacher saves a "template" (e.g., "5 easy MCQs, 3 hard MCQs, True/False section")
- One-click generation with pre-filled settings
- Requires: template CRUD (save/load/edit), storage in localStorage or cloud

### 5. Collaborative quiz editing

- Two teachers editing the same quiz simultaneously
- Requires: WebSocket or real-time sync (Firebase, Liveblocks), auth, conflict resolution

### 6. Quiz analytics dashboard

- Track: quizzes generated, topics covered, time spent
- Useful for schools to see usage patterns
- Requires: database, auth, dashboard UI

### 7. Student-facing quiz mode

- Students take quiz online (score, timer, review)
- Requires: separate frontend, backend API, database, auth
- Essentially a new product

### 8. Custom prompt engineering UI

- Advanced users edit the raw prompt template
- Power users fine-tune question generation
- Requires: prompt editor UI, validation, preset templates

### 9. Multi-language support

- Generate quizzes in Hindi, Tamil, etc.
- Requires: localized prompt templates, font support in PDF, RTL handling

### 10. Backend caching / cost control

- Cache common topic generations (same topic + difficulty = same prompt hash)
- Rate limiting per user
- Requires: Redis/DynamoDB, auth layer, usage tracking

---

## Recommended Priority

### Immediate (next 2-3 sprints)

1. Undo button
2. Keyboard shortcuts
3. Bulk delete
4. Toast for oversized avoid list

### Near-term (1-2 months)

3. Word export
4. PDF layout customization
5. Quiz metadata

### Long-term (3+ months)

1. Multiple question types
2. AI model selection
3. Template system
