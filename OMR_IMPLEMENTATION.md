# OMR Sheet Generator & Reader — Implementation Plan

## Architecture

**Everything runs client-side in the browser.** No server or Netlify changes needed.

Uses two libraries already loaded via CDN:

- **jsPDF** — OMR sheet PDF generation
- **pdf.js** — PDF rendering to canvas for reading

New code added to `index.html` (~1,100 lines of JS). A tab toggle switches between the existing Quiz Generator and the new OMR mode.

**Zero new dependencies.**

---

## OMR Sheet Design (A4, Multi-Column)

```
+--------------------------------------------------+
| ■                                          ■     |  Registration marks (10mm black squares)
|        DREAM CENTRE — OMR ANSWER SHEET           |
|  Exam: Physics Mid-Term    Date: 2026-03-31      |
|                                                  |
|  Roll No:  [0][1][2][3][4][5][6][7][8][9]       |  10 bubbles per digit
|             [0][1][2][3][4][5][6][7][8][9]       |  6 digit positions (configurable)
|             [0][1][2][3][4][5][6][7][8][9]       |
|             [0][1][2][3][4][5][6][7][8][9]       |
|             [0][1][2][3][4][5][6][7][8][9]       |
|             [0][1][2][3][4][5][6][7][8][9]       |
|                                                  |
+--------------------------------------------------+
|  Q1  [A][B][C][D]   Q34 [A][B][C][D]   Q67 ...  |  3-column answer grid
|  Q2  [A][B][C][D]   Q35 [A][B][C][D]   Q68 ...  |
|  Q3  [A][B][C][D]   Q36 [A][B][C][D]   Q69 ...  |
|  ...                                              |
|                                                  |
| ■                                          ■     |  Bottom registration marks
|                           Page 1 of 2            |
+--------------------------------------------------+
```

### Layout Rules

| Question count | Columns | Pages    |
| -------------- | ------- | -------- |
| 1-50           | 2       | 1        |
| 51-100         | 3       | 1        |
| 101-200        | 3       | 2        |
| 200+           | 3       | multiple |

### Registration Marks

- 4 filled black squares (10mm x 10mm) at corners
- Used by the reader to detect rotation, skew, and scale
- Compute affine transform: sheet coordinates to image coordinates

### Roll Number Grid

- Each digit position has 10 bubbles (0-9)
- Student fills one bubble per column
- Default 6 digits, configurable 4-10
- No handwriting / OCR needed

---

## OMR Reader Algorithm (Client-Side, Traditional CV)

No AI. Pure pixel analysis via Canvas API.

### Step 1 — PDF to Canvas

- Render each page at **200 DPI** using pdf.js
- High enough for bubble detection, low enough for speed

### Step 2 — Grayscale Conversion

- Convert `getImageData()` to grayscale
- Formula: `gray = 0.299R + 0.587G + 0.114B`

### Step 3 — Registration Mark Detection

- Scan the 4 corner regions (+-15% of page from each corner)
- Look for dark connected regions matching expected mark size
- Compute:
  - **Rotation angle** from slope of top-left to top-right marks
  - **Skew** from vertical offset between left and right pairs
  - **Affine transform** to map sheet coordinates to image coordinates

### Step 4 — Bubble Analysis

For each expected bubble position (transformed via affine map):

- Sample a circular mask (radius ~5mm in image space)
- Count pixels below darkness threshold (gray < 128)
- **Fill ratio** = dark pixels / total pixels in circle
- Fill ratio > 0.35 → **marked**
- Fill ratio < 0.15 → **unmarked**
- Between → **ambiguous**

### Step 5 — Answer Extraction

- Per question: find the option with highest fill ratio
- If none > 0.35 → unanswered
- If multiple > 0.35 → ambiguous
- Roll number: per digit column, find bubble with highest fill ratio > 0.35

### Step 6 — Grading

- Compare extracted answers against stored answer key
- Score = correct count
- Flag ambiguous/unanswered separately

---

## Processing Capacity

| Batch size               | Time estimate | Notes                   |
| ------------------------ | ------------- | ----------------------- |
| 50 PDFs (1-2 pages each) | 2-4 minutes   | Comfortable             |
| 100 PDFs                 | 4-8 minutes   | Fine with progress bar  |
| 200 PDFs                 | 8-15 minutes  | Upper comfortable limit |

Processing is **sequential** (one PDF at a time). Canvas is released after each PDF to keep memory under ~200MB peak. Progress bar shows "Processing PDF 47/200...".

---

## UI Changes (in index.html)

### Tab Toggle (top of page)

Two tabs:

1. **Quiz Generator** — existing functionality, unchanged
2. **OMR Sheet** — new OMR mode

### OMR Generator View

- Number of questions (auto-fills from current quiz or manual entry)
- Number of options (2-6, default 4)
- Roll number digits (4-10, default 6)
- Exam title
- "Generate OMR Sheet" button → downloads PDF

### OMR Grading View

- **Answer key input** — two methods:
  - Textarea: one answer per line (A, B, C, D...)
  - Import from current quiz JSON (auto-maps correct answers to letters)
- Roll number digit count (must match generated sheet)
- **PDF upload dropzone** — accepts multiple PDFs (drag and drop or click)
- **"Start Grading"** button
- **Progress bar** during processing
- **Results table:**

  | Roll No | Score  | %   | Status | Details                       |
  | ------- | ------ | --- | ------ | ----------------------------- |
  | 123456  | 85/100 | 85% | OK     | Q12 ambiguous, Q45 unanswered |
  | 789012  | 72/100 | 72% | OK     | Q3, Q7, Q22 wrong             |
  | ???     | —      | —   | FAIL   | Roll number unreadable        |

- **Export CSV** button
- **Summary stats:** average, highest, lowest, median, std dev

---

## Implementation Order

| #   | Component                                | Lines (est.) | Depends on |
| --- | ---------------------------------------- | ------------ | ---------- |
| 1   | Tab toggle UI                            | ~30          | Nothing    |
| 2   | OMR Generator UI (form)                  | ~80          | Nothing    |
| 3   | OMR Sheet generation (jsPDF)             | ~250         | #2         |
| 4   | Grading UI (form + dropzone)             | ~80          | Nothing    |
| 5   | PDF reader + registration mark detection | ~200         | pdf.js     |
| 6   | Bubble analysis engine                   | ~150         | #5         |
| 7   | Roll number extraction                   | ~80          | #6         |
| 8   | Grading logic + results table            | ~120         | #6, #7     |
| 9   | CSV export + summary stats               | ~50          | #8         |
| 10  | Wiring, progress bar, error handling     | ~70          | All above  |

**Total: ~1,110 lines of new JS in index.html**

---

## File Changes

| File                    | Changes                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`            | Add OMR tab toggle, generator UI, grading UI, sheet generation logic, reader logic, results display |
| `OMR_IMPLEMENTATION.md` | This file (plan document)                                                                           |

No other files modified. No new dependencies added.

---

## Risks and Mitigations

| Risk                                | Impact                 | Mitigation                                                                      |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| Poor scan quality (blurry/rotated)  | Wrong answers detected | Registration marks + affine correction + threshold tuning guide                 |
| Multiple marks per question         | Ambiguous answer       | Flag separately in results, don't count as wrong                                |
| No marks per question               | Unanswered             | Count as 0, show in details column                                              |
| Large PDF files (>5MB each)         | Slow render            | Process page-by-page, show warning for files >10MB                              |
| Browser memory during 200-PDF batch | Tab crash              | Release canvas after each PDF, process sequentially, warn user not to close tab |
| Student fills wrong roll number     | Unmatched results      | Show "unreadable roll" in results with page preview thumbnail                   |

---

## Scan Quality Tips (shown in UI)

Guide shown to examiner before uploading PDFs:

- Scan at minimum **150 DPI**, ideally 200 DPI
- Use **grayscale** mode (not color, not black-white)
- Ensure the sheet is **flat** (no folds or creases)
- Align the sheet **straight** on the scanner bed
- Avoid shadows, especially at edges
- If using phone camera: use a document scanner app (Adobe Scan, Microsoft Lens), not raw photos

---

## Future: Roll Number Auto-Assignment

When student registration is added later:

- The OMR sheet generator can **pre-print** the assigned roll number as filled or double-bordered bubbles
- The reader would detect these distinct marks and use them as primary
- Falls back to student-shaded bubbles if pre-printed marks are absent
