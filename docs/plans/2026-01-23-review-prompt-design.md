# Microsoft Store Review Prompt - Design Document

## Overview

Encourage users to leave a Microsoft Store review after they've successfully installed their first WSL distribution. The prompt should be non-intrusive, communicate the value of reviews for new apps, and include a direct link to the Store review page.

## User Experience

### Timing

- **Trigger**: Next app launch after first successful distro installation
- **Existing users**: Users who upgrade and already have distros will see the prompt on next launch
- **Maximum prompts**: 2 total (initial + 1 reminder if "Maybe Later" clicked)
- **Reminder delay**: 3 app launches after "Maybe Later"

### Dialog Content

```
┌─────────────────────────────────────────┐
│                                         │
│   Finding WSL UI useful?                │
│                                         │
│   A quick review helps others discover  │
│   this tool and keeps the project       │
│   going. It only takes 30 seconds.      │
│                                         │
│   [Leave a Review]  Maybe Later  No Thanks
│                                         │
└─────────────────────────────────────────┘
```

### Button Actions

| Button | Action | Shows Again? |
|--------|--------|--------------|
| Leave a Review | Opens Store app to review page | Never |
| Maybe Later | Dismisses dialog | After 3 launches (once) |
| No Thanks | Dismisses dialog | Never |

### Store Link

Uses protocol handler to open Store app directly:
```
ms-windows-store://review/?ProductId=9p8548knj2m9
```

## Technical Design

### New Settings Fields

Add to `AppSettings` interface in `src/types/settings.ts`:

```typescript
// Review prompt tracking
reviewPromptState: 'pending' | 'reminded' | 'completed' | 'declined';
reviewPromptLaunchCount: number;
hasCompletedFirstInstall: boolean;
```

**Defaults for new installs:**
- `reviewPromptState: 'pending'`
- `reviewPromptLaunchCount: 0`
- `hasCompletedFirstInstall: false`

### State Machine

| Current State | Condition/Action | New State | Behavior |
|---------------|------------------|-----------|----------|
| `pending` | Has completed first install + app launch | — | Show prompt |
| `pending` | "Leave a Review" clicked | `completed` | Open Store, never show again |
| `pending` | "No Thanks" clicked | `declined` | Never show again |
| `pending` | "Maybe Later" clicked | `reminded` | Reset launch counter to 0 |
| `reminded` | App launch (count < 3) | `reminded` | Increment counter, don't show |
| `reminded` | App launch (count >= 3) | — | Show prompt (final time) |
| `reminded` | Any button clicked | `completed` or `declined` | Never show again |

### New Files

#### `src/hooks/useReviewPrompt.ts`

Custom hook encapsulating all prompt logic:

```typescript
interface UseReviewPromptReturn {
  shouldShowPrompt: boolean;
  handleReview: () => void;
  handleMaybeLater: () => void;
  handleNoThanks: () => void;
  markFirstInstallComplete: () => Promise<void>;
}

export function useReviewPrompt(): UseReviewPromptReturn
```

**Responsibilities:**
- Read settings on mount
- Determine if prompt should show (based on state machine)
- Increment launch counter when in `reminded` state
- Provide handlers that update settings appropriately
- Open Store via `@tauri-apps/plugin-shell` `open()` function
- Expose `markFirstInstallComplete()` for install success handlers
- On mount, check if user has existing distros and set `hasCompletedFirstInstall` accordingly

#### `src/components/dialogs/ReviewPromptDialog.tsx`

Dialog UI component following existing patterns (TelemetryOptInDialog):

```typescript
interface ReviewPromptDialogProps {
  isOpen: boolean;
  onReview: () => void;
  onMaybeLater: () => void;
  onNoThanks: () => void;
}
```

**Styling:**
- Same modal styling as TelemetryOptInDialog (backdrop blur, rounded corners, theme colors)
- Centered, ~400px width
- "Leave a Review" - Primary button (accent color, filled)
- "Maybe Later" - Secondary/ghost button
- "No Thanks" - Text-only/link style (least prominent)

### Modified Files

#### `src/types/settings.ts`
- Add 3 new fields to `AppSettings` interface

#### `src-tauri/src/settings.rs`
- Add corresponding Rust fields with serde defaults

#### `src/App.tsx`
- Import `useReviewPrompt` hook
- Render `ReviewPromptDialog` component (~5 lines)

#### `src/components/dialogs/NewDistroDialog.tsx`
- Call `markFirstInstallComplete()` after successful installations
- Affects ~4 success handlers (quick install, custom install, container, import)

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Existing user upgrades with distros | Detect existing distros on mount, set `hasCompletedFirstInstall: true`, show prompt on that launch |
| Multiple installs in one session | `markFirstInstallComplete()` is idempotent |
| User clicks review but doesn't submit | Cannot detect; assume good faith, mark `completed` |
| User installed from GitHub, not Store | Store review page still works if they sign in with Microsoft account |

## Out of Scope (YAGNI)

- Analytics/telemetry tracking of prompt interactions
- A/B testing different copy
- Settings UI to re-enable the prompt after declining
- Detecting if user actually submitted a review
