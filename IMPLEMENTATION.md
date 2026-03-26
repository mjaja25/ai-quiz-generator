# Minor Upgrades — Implementation Guide

Detailed technical specifications for each minor upgrade.

---

## 1. Undo Button (Delete Question)

### Problem

Teacher accidentally deletes a question and has no way to recover it without regenerating.

### State Changes

```js
let lastDeleted = null; // { question: {...}, index: number }
```

### Implementation

**In `deleteQuestion(index)`:**

- Before splice: save `lastDeleted = { item: generatedData[index], index: index }`
- After splice: call `displayResults()`
- Show toast with "Undo" button that restores the question

**Toast modification:**

- Current `showToast(message)` takes a string and auto-removes after 2600ms
- Change to accept an optional `action` parameter: `showToast(message, actionLabel, actionFn)`
- Render a clickable button inside the toast when `actionLabel` is provided
- Auto-removal timer stays at 2600ms — undo window is short by design

**Restore logic:**

```js
function undoDelete() {
  if (!lastDeleted) return;
  generatedData.splice(lastDeleted.index, 0, lastDeleted.item);
  lastDeleted = null;
  displayResults();
}
```

### Files Changed

- `index.html`: state, `deleteQuestion`, `showToast`, `undoDelete`

### Edge Cases

- If user deletes Q3 and then regenerates Q2, the index may shift. `undoDelete` should check if `lastDeleted.index` is still valid, otherwise append to end.
- Don't allow undo after `displayResults()` from a different action (like "Regenerate All"). Clear `lastDeleted` at the start of `handleGenerate`.

---

## 2. Keyboard Shortcuts

### Key Bindings

| Shortcut     | Action             | Context                     |
| ------------ | ------------------ | --------------------------- |
| `Ctrl+Enter` | Generate questions | When not already generating |
| `Ctrl+S`     | Save quiz as JSON  | When questions exist        |
| `Ctrl+E`     | Export Q&A Key PDF | When questions exist        |

### Implementation

**Add a global keydown listener:**

```js
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    if (!isGenerating) handleGenerate();
  }
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    exportJSON();
  }
  if (e.ctrlKey && e.key === "e") {
    e.preventDefault();
    if (generatedData.length > 0) exportPDF("key");
  }
});
```

**Important:** Don't intercept Ctrl+S/Ctrl+E when focus is inside an `input` or `textarea`. Check `e.target.tagName`:

```js
if (e.ctrlKey && e.key === "s") {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  e.preventDefault();
  exportJSON();
}
```

### Files Changed

- `index.html`: add event listener block

---

## 3. Word Export (.docx)

### Dependency

```bash
npm install docx
```

### Approach

Use the `docx` library to generate a `.docx` file programmatically. Three export modes match the existing PDF exports:

- **Student Sheet**: questions + blank answer circles
- **Questions**: questions + options only
- **Q&A Key**: questions + options + answers + explanations

### Implementation

**New button:** Add "Export Word (.docx)" button next to the PDF export buttons.

**New function: `exportWord(mode)`:**

- Selected questions via `getCheckedIndices()`
- Build a `docx.Document` with:
  - Title paragraph (heading)
  - Date paragraph
  - For each question:
    - Question text (bold)
    - Options list
    - Answer (key mode, green text)
    - Explanation (key mode, italic)
- Student sheet: replace answers with `( )` circles
- Generate blob via `docx.Packer.toBlob(doc)`
- Download via `URL.createObjectURL`

**Refactor export buttons:** The export grid currently has 3 buttons + 3 others. Adding Word makes it 4 exports. Consider reorganizing the grid or using a dropdown for export format (PDF vs Word) with 3 modes.

### Files Changed

- `package.json`: add `docx` dependency
- `index.html`: add button, `exportWord` function, refactor export grid

---

## 4. Auto-expand Topic Suggestions

### Approach

When the user types in the topic field, show autocomplete suggestions below the input.

### Implementation Options

**Option A: Static list with fuzzy match (simple)**

- Maintain a list of ~100 common school topics
- As user types, filter and show top 5 matches
- No API call needed

**Option B: AI-generated suggestions (advanced)**

- Debounced API call to Gemini: "Give 5 topic suggestions related to: {user input}"
- Show as dropdown below topic input
- Requires API call — add a 500ms debounce

**Recommended:** Start with Option A. Easy to implement, no API cost.

### Implementation (Option A)

**Topic list:** Array of common topics by category:

```js
const TOPIC_SUGGESTIONS = [
  "Photosynthesis",
  "Cell Division",
  "DNA Replication",
  "Newton's Laws",
  "Thermodynamics",
  "Electricity",
  "Quadratic Equations",
  "Trigonometry",
  "Calculus",
  "World War II",
  "French Revolution",
  "Indian Constitution",
  // ... ~100 topics
];
```

**Dropdown component:**

- `<div>` positioned below the topic input
- Hidden by default, shown when there are matches
- Clickable items that fill the topic input and hide the dropdown
- Hide on blur/outside click

**Filter logic:**

```js
topicInput.addEventListener("input", () => {
  const val = topicInput.value.toLowerCase().trim();
  if (val.length < 2) {
    hideSuggestions();
    return;
  }
  const matches = TOPIC_SUGGESTIONS.filter((t) =>
    t.toLowerCase().includes(val),
  ).slice(0, 5);
  showSuggestions(matches);
});
```

### Files Changed

- `index.html`: add topic list constant, dropdown HTML/CSS, filter logic, event listeners

---

## 5. Bulk Delete Selected

### Implementation

**New button:** "Delete Selected" in the results header, next to "Regenerate All" and "Deselect All".

**Conditionally visible:** Only show when more than 0 questions are checked AND not all are checked (otherwise just use "Deselect All" + "Regenerate All").

**Logic:**

```js
function deleteSelected() {
  const selected = getCheckedIndices();
  if (selected.length === 0) return;
  // Remove in reverse order to preserve indices
  for (let i = selected.length - 1; i >= 0; i--) {
    generatedData.splice(selected[i], 1);
  }
  displayResults();
  showToast(`Deleted ${selected.length} questions`);
}
```

**Update `updateSelectedCount`:** Also show/hide the "Delete Selected" button based on selection.

### Files Changed

- `index.html`: add button in results header, `deleteSelected` function, update `updateSelectedCount`

---

## 6. PDF Layout Customization

### Approach

Add a collapsible "PDF Settings" section in the form with options for:

- Font size (Small 9pt, Medium 11pt, Large 13pt)
- Line spacing (Compact, Normal, Wide)
- Show question numbers (Yes/No)

### Implementation

**New section:** Below settings grid, above "Previous Questions" upload.

**New state variables:**

```js
let pdfSettings = {
  fontSize: 11,
  lineSpacing: "normal", // "compact" | "normal" | "wide"
  showNumbers: true,
};
```

**Modify `exportPDF(mode)`:**

- Use `pdfSettings.fontSize` instead of hardcoded 11/10
- Use `pdfSettings.lineSpacing` to adjust `y` increment between questions
- Use `pdfSettings.showNumbers` to optionally hide question numbers

**Spacing multipliers:**

```js
const spacing = { compact: 0.7, normal: 1.0, wide: 1.4 };
```

### Files Changed

- `index.html`: add PDF settings UI, state, modify `exportPDF`

---

## 7. Mobile Keyboard Handling

### Problem

On mobile, when a textarea is focused, the virtual keyboard covers the content being edited.

### Implementation

**On textarea focus, scroll into view with offset:**

```js
// In displayResults, after creating each textarea:
qTextarea.addEventListener("focus", () => {
  setTimeout(() => {
    qTextarea.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300); // Wait for keyboard to appear
});
```

**Apply to all textareas:** question, option, explanation, answer textareas.

**Also add to the topic input and modifier input** for the generation form section.

**Viewport fix:** Add to CSS:

```css
textarea:focus {
  scroll-margin-top: 100px;
}
```

### Files Changed

- `index.html`: add focus event listeners on textareas, CSS tweak

---

## 8. Toast for Oversized Avoid List

### Problem

When the uploaded avoid list exceeds 3000 chars, the teacher has no feedback about how many questions are actually being sent to the AI.

### Implementation

**In `mergeAvoidList`:**

- Count how many questions were included vs total
- Return this info along with the prompt

**Change `mergeAvoidList` return type:**

```js
function mergeAvoidList(prompt, extraAvoid) {
  // ... existing logic ...
  return { prompt, included: included.length, total: unique.length };
}
```

**Update callers** (`buildPrompt`, `buildRegenPrompt`) to destructure:

```js
const result = mergeAvoidList(prompt, extraAvoid);
prompt = result.prompt;
// Store for UI feedback
lastAvoidStats = { included: result.included, total: result.total };
```

**Show warning in UI:**

- After generation, if `lastAvoidStats.total > lastAvoidStats.included`, show a toast:
  `"Note: ${included} of ${total} avoid questions were used (token limit reached)."`

**Or show as a persistent info banner** above the results section when avoid list is active.

### Files Changed

- `index.html`: modify `mergeAvoidList` return, show warning toast/banner

---

## 9. Quiz Metadata in JSON Export

### Problem

Exported JSON only has title, difficulty, timestamp, and questions. No subject, grade, or teacher info.

### Implementation

**New form fields (optional, below "Quiz Title"):**

- Subject (dropdown: Math, Science, English, Social Studies, etc.)
- Grade Level (dropdown: 6-12)
- Teacher Name (text input)

**Modify `exportJSON`:**

```js
const payload = {
  title,
  subject: subjectSelect.value,
  gradeLevel: gradeSelect.value,
  teacherName: teacherNameInput.value.trim(),
  difficulty: difficultySelect.value,
  generatedAt: new Date().toISOString(),
  questions: generatedData,
};
```

**Modify `importJSON`:**

- Restore these fields if present in the imported file
- Gracefully handle files without them (backwards compatible)

**Add to PDF header:** Optionally show subject and grade in the PDF title/header.

### Files Changed

- `index.html`: add 3 new form fields, modify `exportJSON`, `importJSON`, `saveFormState`, `loadFormState`

---

## 10. Dark/Light Mode Toggle

### Implementation

**Toggle button:** Small icon in the top-right corner of the page (sun/moon icon).

**CSS approach:** Use CSS custom properties (variables) for all colors:

```css
:root {
  --bg-primary: #111827; /* gray-900 */
  --bg-secondary: #1f2937; /* gray-800 */
  --bg-input: #374151; /* gray-700 */
  --text-primary: #ffffff;
  --text-secondary: #9ca3af; /* gray-400 */
  --border-color: #4b5563; /* gray-600 */
}

[data-theme="light"] {
  --bg-primary: #f9fafb;
  --bg-secondary: #ffffff;
  --bg-input: #f3f4f6;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #d1d5db;
}
```

**Toggle logic:**

```js
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(LS_PREFIX + "theme", next);
}
```

**Restore on load:** In `loadFormState`, also restore theme from localStorage.

**Tailwind:** Since we use Tailwind CDN with utility classes, we'd need to either:

- Migrate all Tailwind classes to CSS variables (significant work)
- Or use Tailwind's `dark:` prefix and toggle `dark` class on `<html>`

**Recommended:** Use Tailwind `dark:` prefix. Tailwind CDN supports this by default.

### Files Changed

- `index.html`: add toggle button, theme logic, `dark:` prefix on all color classes

---

## Implementation Order

| #                     | Effort | Dependencies                 |
| --------------------- | ------ | ---------------------------- |
| 2. Keyboard shortcuts | Small  | None                         |
| 5. Bulk delete        | Small  | None                         |
| 8. Oversize warning   | Small  | None                         |
| 1. Undo button        | Small  | None                         |
| 7. Mobile keyboard    | Small  | None                         |
| 4. Topic suggestions  | Medium | None                         |
| 9. Quiz metadata      | Medium | None                         |
| 6. PDF customization  | Medium | None                         |
| 3. Word export        | Medium | `docx` npm package           |
| 10. Dark/light mode   | Large  | Tailwind dark: prefix rework |
