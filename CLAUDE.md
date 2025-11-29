# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CritKey is a fast rubric grading application with keyboard shortcuts designed for Canvas LMS. The app is built with React + Vite and integrates directly with Canvas via API to fetch assignments, submissions, and PDFs. Features include offline PDF caching, keyboard-driven grading workflow, collapsible rubric UI, and automated grade staging to Canvas.

## Repository Structure

This is a monorepo with three main directories:
- **Root `package.json`**: Wrapper for deployment and development (Cloudflare Pages compatible)
  - `postinstall` script automatically installs dependencies in subdirectories
  - `dev` script shows reminder to start backend server
- **`rubric-grader/`**: React frontend application (Vite + React 18)
- **`server/`**: Express backend proxy for Canvas API (CORS workaround)

## Development Commands

### Quick Start (Two Terminals Required)

**Terminal 1 - Frontend (Root directory):**
```bash
npm install      # Installs dependencies in all subdirectories (via postinstall)
npm run dev      # Start frontend dev server (shows reminder to start backend)
```

**Terminal 2 - Backend:**
```bash
cd server
npm run dev      # Start Express backend on port 3001
```

### Individual Commands

From the **root directory**:
```bash
npm install      # Automatically installs in rubric-grader/ and server/ subdirectories
npm run dev      # Start frontend (with backend reminder)
npm run build    # Production build
npm run preview  # Preview production build
```

From the **server/** directory:
```bash
npm run dev      # Start backend server (nodemon with hot reload)
```

From the **rubric-grader/** directory:
```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Architecture

### State Management (Zustand)

The app uses **two Zustand stores** for separation of concerns:

#### 1. `rubricStore.js` - Rubric & Grading State
- **Course/Rubric data**: Multi-course support with localStorage persistence
- **Current grading session**: Auto-saved to localStorage, restored on page load
- **Navigation state**: Current criterion index, auto-advance setting
- **Grading state**: Selected levels, comments, feedback labels
- **Special features**:
  - `correctByDefault`: Auto-selects max points for all criteria
  - `persistCurrentRubric()`: Automatically saves rubric changes back to localStorage

Key methods:
- `initialize()`: Loads saved courses and restores previous session
- `importRubric()`: Parses CSV and saves to current course
- `selectLevel()`, `updateComment()`: Grading actions
- `addLevel()`, `updateLevel()`, `deleteLevel()`: Inline rubric editing
- `replaceCriteria()`: Bulk criterion replacement (used for reordering)
- `saveSession()`: Persists current state to localStorage
- `resetGrading()`: Clears all selections/comments, respects correctByDefault
- `loadRubricForSubmission()`, `saveRubricForSubmission()`: Per-submission rubric state

#### 2. `canvasStore.js` - Canvas LMS Integration State
- **Canvas API data**: Courses, assignments, assignment groups, submissions
- **Request tracking**: Request IDs to prevent race conditions
- **PDF caching**: IndexedDB-based offline PDF storage with progress tracking
- **Grade staging**: Temporary grade storage before Canvas submission
- **Optimizations**:
  - Prefetches assignment groups when fetching courses
  - Atomic state updates to prevent intermediate renders
  - Event-driven PDF loading (not polling)
  - Granular selectors to minimize re-renders

Key methods:
- `initialize()`: Loads Canvas token and saved state
- `saveApiToken()`: Stores Canvas API token securely
- `fetchCourses()`: Fetches courses and prefetches assignment groups
- `fetchAssignments()`: Fetches assignments for a course
- `selectAssignment()`: Generates request ID and fetches submissions
- `fetchSubmissions()`: Fetches submissions with race condition prevention
- `cacheAllPdfs()`: Batch caches PDFs with progress tracking
- `saveRubricScoreForSubmission()`: Stages grade locally before Canvas push
- `pushAllStagedGrades()`: Pushes all staged grades to Canvas in batch
- `applySorting()`: Atomically updates filtered/sorted submission list

### Backend Server (Express Proxy)

Located in `server/server.js`, provides CORS-enabled Canvas API proxy:

**Key Endpoints:**
- `POST /api/canvas/courses`: Fetch instructor courses
- `GET /api/canvas/courses/:courseId/assignments`: Fetch course assignments
- `GET /api/canvas/courses/:courseId/assignment_groups`: Fetch assignment groups
- `GET /api/canvas/courses/:courseId/assignments/:assignmentId/submissions`: Fetch submissions
- `GET /api/canvas/courses/:courseId/assignments/:assignmentId/rubric`: Fetch rubric from assignment
- `PUT /api/canvas/courses/:courseId/assignments/:assignmentId/submissions/:userId`: Update grade/comment
- `GET /api/canvas/proxy/*`: Generic proxy for Canvas API (handles authentication)

**Features:**
- Automatic Canvas API token handling via `Authorization` header
- Request/response logging for debugging
- CORS headers for local development
- Runs on `http://localhost:3001`

### Canvas API Integration

The app integrates directly with Canvas LMS:

1. **Authentication**: Users provide Canvas API token (stored in localStorage)
2. **Course Selection**: Fetches courses for the authenticated instructor
3. **Assignment Loading**: Fetches assignments and their rubrics
4. **Submission Management**: Loads student submissions with PDF attachments
5. **PDF Caching**: Downloads and caches PDFs in IndexedDB for offline access
6. **Grade Staging**: Grades stored locally until user pushes to Canvas
7. **Batch Upload**: All staged grades pushed to Canvas in one operation

**Race Condition Prevention:**
- Request ID system tracks active Canvas API requests
- Validation checkpoints abort stale requests
- Atomic state updates ensure UI consistency

### Canvas CSV Format

Rubrics can also be imported from Canvas CSV exports with this structure:
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

Implemented via `react-hotkeys-hook`. Configuration in `utils/hotkeys.js`:

**Rubric Grading** (in `RubricDisplay.jsx`):
- **1-9**: Select level (1 = highest points)
- **C**: Focus comment field
- **Esc**: Unfocus comment field

**Navigation** (in `App.jsx` - works even when rubric is collapsed):
- **N / →**: Next criterion
- **P / ←**: Previous criterion
- **Space**: Next criterion (when auto-advance is off)
- **Ctrl/Cmd + Shift + →**: Next submission
- **Ctrl/Cmd + Shift + ←**: Previous submission

**Actions** (in `FeedbackGenerator.jsx`):
- **Ctrl/Cmd + Enter**: Generate feedback and copy to clipboard
- **Ctrl/Cmd + R**: Reset rubric
- **S**: Stage grade and feedback for Canvas

**Help**:
- **?**: Show keyboard shortcuts modal

**Key Implementation Details:**
- Navigation hotkeys moved to App level so they work when rubric is collapsed
- Hotkeys use `enableOnFormTags: false` to avoid conflicts with input fields
- Customizable via `ShortcutsModal.jsx` and stored in localStorage

### Component Architecture

**Main Layout:**
- `App.jsx`: Main layout with MUI theme, global navigation hotkeys, criterion info calculation

**Canvas Integration:**
- `SideDrawer.jsx`: Side panel for Canvas connection and navigation
- `CanvasTokenInput.jsx`: Canvas API token entry and validation
- `CourseSelector.jsx`: Course selection dropdown
- `AssignmentSelector.jsx`: Assignment selection with assignment group filtering
- `StudentSelector.jsx`: Student/submission selector with filtering (all/graded/ungraded)
- `PDFViewer.jsx`: PDF rendering with zoom controls, grid mode, persist zoom feature

**Rubric UI:**
- `RubricDisplay.jsx`: Main grading interface with keyboard shortcuts and inline editing
- `DockableRubricWindow.jsx`: Floating draggable rubric window with docking
- `DockedRubricPanel.jsx`: Docked rubric panel (left/right/top) with resize handles
- `TotalPoints.jsx`: Running score display
- `FeedbackGenerator.jsx`: Feedback text generation with history, download, and Canvas staging

**Mini View Feature:**
- When rubric is collapsed/minimized, shows: `Criterion (1/4) - 2/4pts | Total: 15/20`
- Displays current criterion points and running total
- Auto-fits width to prevent text wrapping
- Updates as user navigates with arrow keys

**Setup UI (Legacy CSV Import):**
- `SetupDrawer.jsx`: Course/rubric selection, CSV import, settings
- `RubricSelector.jsx`: Rubric selection dropdown
- `CSVImport.jsx`: CSV file import for rubrics

**Utilities:**
- `ShortcutsModal.jsx`: Keyboard shortcuts help modal
- `HotkeyCustomizer.jsx`: Hotkey customization interface

### PDF Caching (IndexedDB)

PDFs are cached locally for offline access using IndexedDB (`utils/pdfCache.js`):

**Features:**
- Automatic caching when viewing submissions
- Batch "Cache All" operation with progress tracking
- Fallback to direct Canvas API if cache miss
- Event-driven loading (no polling) via Zustand subscriptions
- AbortController for proper cleanup on navigation

**Storage:**
- Database: `CritKeyPDFCache`
- Store: `pdfs`
- Key: `${fileUrl}_${assignmentId}_${submissionId}`
- Value: Blob of PDF file

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
- Stage grade feature: Stores grade locally before batch push to Canvas

## Deployment

Configured for Cloudflare Pages:
- Root directory: `/`
- Build command: `npm run build`
- Build output: `rubric-grader/dist`
- Node version: 18+

The root package.json handles building from the subdirectory automatically.

## Common Tasks

### Adding a new keyboard shortcut
1. Add hotkey to `DEFAULT_HOTKEYS` in `utils/hotkeys.js`
2. Add description to `getHotkeyDescriptions()` in `utils/hotkeys.js`
3. Add hotkey handler using `useHotkeys()` in appropriate component:
   - Navigation: `App.jsx` (works when collapsed)
   - Level selection/comment: `RubricDisplay.jsx`
   - Actions: `FeedbackGenerator.jsx`
4. Update `ShortcutsModal.jsx` to display the new shortcut

### Adding a new Canvas API endpoint
1. Add route to `server/server.js`
2. Add corresponding method to `canvasStore.js`
3. Handle authentication via `Authorization` header
4. Add error handling and loading states
5. Consider race condition prevention if needed (request IDs)

### Modifying rubric structure
1. Update parsing in `csvParser.js`
2. Update store methods in `rubricStore.js`
3. Update components that read/write rubric data
4. Consider localStorage migration if structure changes
5. Update per-submission rubric storage if needed

### Testing Canvas integration locally
1. Start backend server: `cd server && npm run dev`
2. Start frontend: `npm run dev` (from root)
3. Obtain Canvas API token from your Canvas account settings
4. Test with a real Canvas course/assignment

### Testing CSV import
Example rubrics are in `Example Rubric/` directory.

## Performance Optimizations

### State Flow Best Practices
- Use **request IDs** for async operations to prevent race conditions
- Make **atomic state updates** (single `set()` call) to avoid intermediate renders
- Use **granular selectors** in components to minimize re-renders
- Implement **event-driven patterns** instead of polling
- Use **AbortController** for cancellable async operations
- **Prefetch** related data when loading parent data (e.g., assignment groups with courses)

### React Optimization Patterns
- Use `useMemo()` for expensive calculations
- Use granular Zustand selectors instead of destructuring entire state
- Move global hotkeys to App level to work when components unmounted
- Use `enableOnFormTags: false` to prevent hotkey conflicts with inputs
