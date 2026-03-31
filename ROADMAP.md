# AI Quiz Generator — Upgrade Roadmap

All minor upgrades have been implemented. Remaining work is on these major upgrades, ordered by easiness.

---

## Major Upgrades

### 1. Custom prompt engineering UI — Medium | Priority: Medium

- Advanced users edit the raw prompt template
- Power users fine-tune question generation
- Requires: prompt editor UI, validation, preset templates

### 2. Quiz template system — Medium | Priority: High

- Teacher saves a "template" (e.g., "5 easy MCQs, 3 hard MCQs, True/False section")
- One-click generation with pre-filled settings
- Requires: template CRUD (save/load/edit), storage in localStorage or cloud

### 3. Multiple question types — Medium-High | Priority: High

- Add True/False, Fill-in-the-blank, Match-the-following alongside MCQ
- Requires: new UI sections per type, new PDF rendering per type, prompt engineering per type
- Impact: doubles the export/render code

### 4. Multi-language support — Medium-High | Priority: Medium

- Generate quizzes in Hindi, Tamil, etc.
- Requires: localized prompt templates, font support in PDF, RTL handling

### 5. Batch quiz generation — Medium-High | Priority: Medium

- Generate multiple topic quizzes in one session
- Teacher enters 5 topics, gets 5 separate quizzes as a single PDF
- Requires: queuing system, multi-PDF merge, progress indicator

### 6. Quiz analytics dashboard — High | Priority: Low

- Track: quizzes generated, topics covered, time spent
- Useful for schools to see usage patterns
- Requires: database, auth, dashboard UI

### 7. Backend caching / cost control — High | Priority: Medium

- Cache common topic generations (same topic + difficulty = same prompt hash)
- Rate limiting per user
- Requires: Redis/DynamoDB, auth layer, usage tracking

### 8. Collaborative quiz editing — High | Priority: Low

- Two teachers editing the same quiz simultaneously
- Requires: WebSocket or real-time sync (Firebase, Liveblocks), auth, conflict resolution

### 9. Student-facing quiz mode — Very High | Priority: Low

- Students take quiz online (score, timer, review)
- Requires: separate frontend, backend API, database, auth
- Essentially a new product
