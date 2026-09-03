# Test Acceptance Checklist

Use this checklist before accepting a feature, bug fix, release candidate, or pull request.
Check only criteria that apply to the change. Record an exception, its impact, and a follow-up issue when an applicable item cannot pass.

## Change details

- [ ] Change / issue reference:
- [ ] Tester:
- [ ] Date:
- [ ] Target branch or commit:
- [ ] Scope and user-visible behavior:

## 1. Baseline quality gates

- [ ] The relevant unit/component tests pass.
- [ ] The complete frontend suite passes:
  ```powershell
  npm run test:run
  ```
- [ ] TypeScript validation passes:
  ```powershell
  npx tsc --noEmit
  ```
- [ ] Production frontend build passes:
  ```powershell
  npm run build
  ```
- [ ] The Tauri debug build passes when Tauri, capabilities, popup windows, or E2E behavior changed:
  ```powershell
  npm run tauri:build:debug
  ```
- [ ] `src-tauri\target\debug\wsl-ui.exe` has a modified time matching the validation run.
- [ ] No unintended formatting or whitespace errors are present:
  ```powershell
  git diff --check
  ```

## 2. Automated-test acceptance

- [ ] Tests cover the changed behavior, not merely implementation details.
- [ ] Tests cover the expected success path.
- [ ] Tests cover relevant failure, cancellation, stale-event, or cleanup paths.
- [ ] Tests are deterministic: they do not depend on prior test state, locale, timing delays, or test execution order.
- [ ] E2E assertions use stable selectors, ARIA state, or exposed application state where possible. Do not hard-code translated display text unless validating a translation.
- [ ] New or changed user-action failures are documented in `docs/TROUBLESHOOTING.md` when the information would help an application user recover.

## 3. E2E environment preparation

Complete this section before running an E2E spec that uses Tauri/WebDriver.

- [ ] The debug application was rebuilt after the latest code and capability changes.
- [ ] Any prior test driver processes were stopped:
  ```powershell
  Get-Process -Name tauri-driver, msedgedriver -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  ```
- [ ] No stale application instance will conflict with the test run.
- [ ] The selected test command receives the spec path correctly:
  ```powershell
  npm run test:e2e:spec -- src/test/e2e/specs/<spec-name>.spec.ts
  ```
- [ ] If an Origin-header, missing-session, or closed-WebView error occurs, follow the recovery procedure in `docs/TROUBLESHOOTING.md` before treating it as an application failure.

## 4. Quick Actions popup acceptance

Apply this section to changes involving `QuickActionsMenu`, `QuickActionsPopup`, `PopupHost`, or `usePopupWindow`.

### Opening and presentation

- [ ] The Quick Actions button opens one correctly positioned popup for the intended distribution.
- [ ] The popup displays actions applicable to that distribution and its state.
- [ ] Opening the popup does not automatically focus or visually preselect the first action.
- [ ] The popup fits within the active monitor boundaries, including monitors with negative coordinates.
- [ ] Reopening the popup uses the latest distro data and does not show stale submenu state.

### Closing behavior

- [ ] Clicking any action hides the popup promptly.
- [ ] Clicking outside the popup hides it promptly.
- [ ] Pressing `Escape` hides the popup promptly.
- [ ] Switching application focus hides the popup promptly.
- [ ] Closing the popup restores a usable main-window state without closing the main application window.
- [ ] Repeated open/close cycles do not leave an always-on-top popup visible or create duplicate popup windows.

### Action behavior

- [ ] The selected action is delivered exactly once to the main window.
- [ ] The popup closes without racing ahead of its selected action.
- [ ] Actions that open dialogs (for example Clone, Export, Rename, or Distribution Info) show the correct main-window dialog.
- [ ] Actions requiring a stopped distribution show the stop-before-action flow when the distro is running.
- [ ] Cancelling a follow-up dialog leaves no popup visible and does not perform the action.
- [ ] Disabled actions cannot be invoked.

### Keyboard and accessibility

- [ ] The popup menu has an accessible name and `role="menu"`.
- [ ] Action controls use `role="menuitem"` and meaningful labels.
- [ ] Keyboard navigation works after the user places focus in the menu.
- [ ] `Home`, `End`, `ArrowUp`, and `ArrowDown` navigate enabled menu items correctly.
- [ ] Focus and visual state do not imply an action has been selected before activation.

### Targeted automated checks

- [ ] Popup unit/component tests pass:
  ```powershell
  npx vitest run src/components/PopupHost.test.tsx src/components/QuickActionsPopup.test.tsx src/hooks/usePopupWindow.test.tsx --silent
  ```
- [ ] The Quick Actions menu-toggle E2E checks pass:
  ```powershell
  npm run test:e2e:spec -- src/test/e2e/specs/quick-actions.spec.ts --mochaOpts.grep "Menu Toggle"
  ```
- [ ] The full Quick Actions E2E spec passes, or any unrelated failures are recorded below:
  ```powershell
  npm run test:e2e:spec -- src/test/e2e/specs/quick-actions.spec.ts
  ```

## 5. Regression review

- [ ] Existing user flows affected by the change were exercised manually or by automated tests.
- [ ] No console errors, unhandled promise rejections, or React warnings appear during the relevant test run.
- [ ] No new capability permissions are broader than necessary.
- [ ] Generated Tauri capability schema changes match the intended capability file changes.
- [ ] Documentation and release notes reflect user-visible behavior changes when applicable.

## 6. Exceptions and follow-up

| Checklist item | Reason not accepted | Impact | Follow-up issue / owner |
| --- | --- | --- | --- |
|  |  |  |  |

## Final decision

- [ ] **Accepted** - all applicable checks passed, or approved exceptions are recorded above.
- [ ] **Not accepted** - blocking issue(s) remain.
