---
name: opx-playwright
description: Browser automation and UI verification with Playwright — test pages, fill forms, take screenshots, check responsive layouts, validate UX, exercise login flows, and check links. Prefers the Playwright MCP server when available; otherwise runs npx playwright scripts.
---

This skill drives a real browser to verify and automate UI work: rendering, interactions, responsive behavior, accessibility, login flows, and link health. Use it to *prove* a UI change works rather than asserting it does.

## CRITICAL: detect the server first

Before navigating, find the running app. Check common dev ports (`3000`, `5173`, `8080`, `4321`, `1313`, …) or start the project's dev server if none is up. Never assume a URL — confirm it responds, then parameterize it (don't hard-code) so the same script works across environments.

## Preferred path: Playwright MCP server

If Playwright MCP browser tools are available in the session (e.g. `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_resize`, `browser_console_messages`), use them directly — they give structured page state and are the cleanest way to drive the browser inside OpenCode:

1. `browser_navigate` to the detected URL.
2. `browser_snapshot` to read the accessibility tree (prefer this over screenshots for assertions — it's structured and cheap).
3. Interact with `browser_click` / `browser_type` / `browser_select_option` using roles/labels from the snapshot.
4. `browser_take_screenshot` for visual evidence; `browser_resize` to check breakpoints; `browser_console_messages` to catch runtime errors.

## Fallback path: npx playwright

If the MCP tools are not present, write a throwaway script to `/tmp` (never into the project tree) and run it with `npx playwright`:

- Ensure the browser is installed once: `npx playwright install chromium`.
- Write `/tmp/opx-pw-<task>.mjs` using `@playwright/test`'s `chromium`, navigate, assert, and capture screenshots to `/tmp`.
- Run headless in CI; use `headless: false` only when a human is watching.
- Clean up `/tmp` scripts when done.

## What to verify

- **Rendering & states**: default, hover, focus, loading, error, empty, disabled.
- **Responsive**: each required breakpoint (mobile/tablet/desktop) via viewport resize.
- **Flows**: login, form submit/validation, navigation — assert the resulting state, not just that a click happened.
- **Accessibility**: focus order, roles/labels in the snapshot, color-contrast-affecting states, reduced-motion.
- **Health**: no console errors; internal links resolve (no 404s).

## Output

Report concrete evidence — screenshot paths, the snapshot/assertions that passed or failed, console errors. When run inside a Cerebro task, put this in the `VERIFICATION` section of your `TASK_RESULT`; never claim visual verification happened unless you actually drove the browser.
