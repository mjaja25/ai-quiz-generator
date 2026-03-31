# Changelog

## Changes in last commit (00fcedd)

### Feature: Add UI limits for questions and file uploads

**Date:** 2026-03-31

**Changes:**

1. **Question Limit Display**
   - Added helper text "Max: 20 questions" below the Questions input field
   - Improves UX by clearly communicating the generation limit to users

2. **File Upload Limit**
   - Added maximum of 5 files for the "questions to avoid" upload section
   - Updated dropzone hint to show "(Max 5 files)"
   - Added validation logic:
     - Shows toast error when user tries to upload more than 5 files
     - Processes only the first 5 files, ignoring excess files
     - Notifies user when files are being ignored due to limit

**Files Modified:**

- `index.html` (+19 lines, -1 line)

**Previous Limit Status:**

- Question limit (20) was enforced but not displayed to users
- File upload had no limit
