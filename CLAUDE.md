# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CritKey is a fast rubric grading application with keyboard shortcuts designed for Canvas LMS. The app is built with React + Vite and stores all data locally in the browser. It allows educators to import Canvas rubric CSVs, grade students using keyboard shortcuts, and generate formatted feedback.

## Repository Structure

This is a monorepo with two package.json files:
- **Root `package.json`**: Wrapper for deployment (Cloudflare Pages compatible)
- **`rubric-grader/package.json`**: The actual React application

All development happens in the `rubric-grader/` subdirectory.

## Development Commands

From the **root directory**:

```bash
npm run dev      # Start development server (runs cd rubric-grader && npm run dev)
npm run build    # Production build (runs cd rubric-grader && npm ci && npm run build)
npm run preview  # Preview production build
```

From the **rubric-grader/** directory:

```bash
npm install      # Install dependencies
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Architecture

### State Management (Zustand)

The app uses a single Zustand store (`rubric-grader/src/store/rubricStore.js`) that manages:

- **Course/Rubric data**: Multi-course support with localStorage persistence
- **Current grading session**: Auto-saved to localStorage, restored on page load
- **Navigation state**: Current criterion index, auto-advance setting
- **Grading state**: Selected levels, comments, feedback labels
- **Special features**:
  - `correctByDefault`: Auto-selects max points for all criteria
  - `persistCurrentRubric()`: Automatically saves rubric changes back to localStorage

Key store methods:
- `initialize()`: Loads saved courses and restores previous session
- `importRubric()`: Parses CSV and saves to current course
- `selectLevel()`, `updateComment()`: Grading actions
- `addLevel()`, `updateLevel()`, `deleteLevel()`: Inline rubric editing
- `replaceCriteria()`: Bulk criterion replacement (used for reordering)
- `saveSession()`: Persists current state to localStorage
- `resetGrading()`: Clears all selections/comments, respects correctByDefault

### Canvas CSV Format

Rubrics are parsed from Canvas CSV exports with this structure:
```
Rubric Name, Criteria Name, Criteria Description, Criteria Enable Range, Rating Name, Rating Description, Rating Points, ...
```

Each row is one criterion. Rating levels come in groups of 3 columns (Name, Description, Points).

Parsing logic in `rubric-grader/src/utils/csvParser.js`:
- `parseCanvasRubricCSV()`: Entry point for CSV file
- `processCanvasCSV()`: Converts rows to internal rubric structure
- `generateCanvasCSV()`: Exports rubrics back to Canvas format
- Levels are automatically sorted by points descending (highest first)

### Internal Rubric Data Structure

```javascript
{
  name: string,
  feedbackLabel: string,  // Optional label for feedback history
  criteria: [
    {
      name: string,
      description: string,
      enableRange: string,
      levels: [
        { name: string, description: string, points: number }
      ],
      selectedLevel: number | null,  // Index into levels array
      comment: string
    }
  ],
  createdAt: string
}
```

### LocalStorage Schema

All data stored in browser localStorage (no server):

```javascript
// Storage keys (see rubric-grader/src/utils/localStorage.js)
{
  'hotrubric_rubrics': {
    [courseId]: [rubric, rubric, ...]
  },
  'hotrubric_current_session': {
    currentCourse: string,
    currentRubric: object,
    currentCriterionIndex: number,
    autoAdvance: boolean,
    correctByDefault: boolean
  },
  'hotrubric_feedback_history': [
    { id, text, rubricName, label, timestamp }
  ]  // Last 5 entries
}
```

### Keyboard Shortcuts

Implemented via `react-hotkeys-hook` in `RubricDisplay.jsx`:

- **1-9**: Select level (1 = highest points)
- **N / →**: Next criterion (with auto-advance option)
- **P / ←**: Previous criterion
- **C**: Focus comment field
- **Esc**: Unfocus comment field
- **Ctrl/Cmd + Enter**: Generate feedback

### Component Architecture

- `App.jsx`: Main layout with MUI theme
- `SetupDrawer.jsx`: Course/rubric selection, CSV import, settings
- `RubricDisplay.jsx`: Main grading interface with keyboard shortcuts (largest component)
- `FeedbackGenerator.jsx`: Feedback text generation with history and download
- `TotalPoints.jsx`: Running score display
- `CourseSelector.jsx`, `RubricSelector.jsx`, `CSVImport.jsx`: Setup UI components

### LaTeX Support

The app supports inline LaTeX rendering using KaTeX:
- Rubric text can contain `$$expression$$`
- Feedback generation converts to Canvas-compatible `\(expression\)` format
- See `toInlineLatex()` in `csvParser.js`

### Feedback Download Feature

`FeedbackGenerator.jsx` supports:
- Single rubric: Download as `.txt` file
- Multiple history entries: Package as `.zip` with JSZip
- Filenames use sanitized rubric names or feedback labels

## Deployment

Configured for Cloudflare Pages:
- Root directory: `/`
- Build command: `npm run build`
- Build output: `rubric-grader/dist`
- Node version: 18+

The root package.json handles building from the subdirectory automatically.

## Common Tasks

### Adding a new keyboard shortcut
1. Add hotkey handler in `RubricDisplay.jsx` using `useHotkeys()`
2. Update keyboard shortcuts help text in `App.jsx`

### Modifying rubric structure
1. Update parsing in `csvParser.js`
2. Update store methods in `rubricStore.js`
3. Update components that read/write rubric data
4. Consider localStorage migration if structure changes

### Testing CSV import
Example rubrics are in `Example Rubric/` directory.
