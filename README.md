# Slapwright

**Lightning-fast web testing CLI built for AI agents.**

Slapwright gives AI agents (Claude, GPT, Gemini, or any LLM) a dead-simple interface to interact with web applications. One command to see the screen. One command to click. One command to type. No Playwright dependency, no browser launch overhead, no complex API -- just a CLI that connects to Chrome via CDP and does exactly what you tell it.

```
slapwright peek        # screenshot + full element tree -- instant understanding
slapwright tap @login  # click a button by data-testid
slapwright type @email "user@example.com"  # type into an input
```

## Why This Exists

Existing web testing tools weren't designed for AI agents. Playwright is 50MB+ and requires programmatic usage. Selenium needs driver management. Browser MCP servers are heavy and complex. AI agents need something different:

- **One command = one action.** No setup, no boilerplate, no session management.
- **`peek` gives you everything.** Screenshot + collapsed accessibility tree in a single call. An AI agent can see the page and know every interactive element instantly.
- **Auto-wait on every interaction.** Elements not ready yet? Slapwright polls automatically. No `sleep`. No retry loops.
- **Rich error messages.** When an element isn't found, the error shows you what IS on the page so you can adapt immediately.
- **Session auto-recovery.** Chrome restarted? WebSocket died? The next command silently reconnects.

## Stats

| Metric | Value |
|--------|-------|
| Source files | 6 |
| Tests | 72 |
| Bundle size | 38KB |
| Runtime deps | 1 (`ws`) |
| Startup time | ~50ms |

## Quick Start

### Prerequisites

- Node.js 18+
- Chrome running with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile &
```

### Install

```bash
git clone https://github.com/arthurfordllc/slapwright.git
cd slapwright
npm install
npm run build
```

### Configure

Copy the example config and edit it:

```bash
cp slapwright.config.example.json slapwright.config.json
```

Edit `slapwright.config.json` with your Chrome port, app URL, and login credentials.

### Run

```bash
./bin/slapwright peek
```

## Commands

### The Big Three (90% of usage)

```bash
slapwright peek                          # Screenshot + element tree
slapwright tap <selector>                # Click element with auto-wait
slapwright type <selector> <text>        # Clear + type into input
```

### Navigation

```bash
slapwright navigate <url>                # Go to URL (relative or absolute)
slapwright back                          # Browser back
slapwright reload                        # Reload page
```

### Interaction

```bash
slapwright tap <selector>                # Click element
slapwright type <selector> <text>        # Type into input
slapwright select <selector> <value>     # Choose dropdown option
slapwright check <selector>              # Check checkbox
slapwright uncheck <selector>            # Uncheck checkbox
slapwright otp <digits>                  # Enter OTP digits into numeric inputs
slapwright scroll <up|down>              # Scroll one page
slapwright scroll-to <selector>          # Scroll element into view
```

### Waiting

```bash
slapwright wait <selector> [timeout]     # Wait for element visible
slapwright wait-text "<text>" [timeout]  # Wait for text on page
slapwright wait-gone <selector> [timeout]  # Wait for element gone
slapwright wait-url <pattern> [timeout]  # Wait for URL to match
slapwright wait-network [timeout]        # Wait for network idle
```

### Assertions (exit code 0 = pass, 1 = fail)

```bash
slapwright assert <selector>             # Visible -> exit 0
slapwright assert-text "<text>"          # Text on page -> exit 0
slapwright assert-not <selector>         # NOT visible -> exit 0
slapwright assert-url <pattern>          # URL matches -> exit 0
```

### Inspection

```bash
slapwright peek                          # Screenshot + element tree (THE command)
slapwright tree                          # Element tree only
slapwright screenshot [name]             # Screenshot only
slapwright source                        # Full page HTML
slapwright inspect <selector>            # Element details (tag, role, text, rect, etc.)
slapwright find "<text>"                 # Find elements by text/label/testid
slapwright console [level]               # Console messages (error/warning/info/debug)
```

### Session & Auth

```bash
slapwright session                       # Connect to Chrome (usually automatic)
slapwright status                        # Check connection
slapwright login [email] [pass] [otp]    # Full login flow (configurable)
slapwright chain "cmd1" "cmd2" ...       # Run commands sequentially, stop on failure
```

## Selectors

Slapwright supports multiple selector strategies:

| Syntax | Matches | Example |
|--------|---------|---------|
| `@testid` | `data-testid` attribute | `@save-btn` |
| `role:button "Save"` | Accessibility role + name | `role:link "Home"` |
| `label:Email` | `aria-label` or `<label>` | `label:Password` |
| `"visible text"` | Text content | `"Submit"` |
| `#id` | Element ID | `#email` |
| `.class` | CSS class | `.btn-primary` |

## How It Works

Slapwright connects to Chrome's DevTools Protocol (CDP) over WebSocket. No browser binary bundled, no Playwright, no Puppeteer. Just a direct WebSocket connection to a running Chrome instance.

- **Accessibility tree** -- `peek` and `tree` use `Accessibility.getFullAXTree()` to get the real accessibility tree, then collapse generic/presentation nodes into a clean, readable summary (~20-30 lines for a typical page).
- **Screenshots** -- captured via `Page.captureScreenshot` CDP method.
- **Element finding** -- uses a flexible selector engine that resolves `@testid`, `role:`, `label:`, text content, `#id`, and `.class` patterns into DOM queries.
- **Session persistence** -- saves the WebSocket URL to `/tmp/slapwright-session.json` for instant reconnect between commands.

## For AI Agent Developers

If you're building an AI agent that needs to interact with web applications, Slapwright is designed for you. Here's the typical workflow:

```bash
# 1. See what's on screen
slapwright peek
# -> saves screenshot, prints element tree with all interactive elements

# 2. Interact
slapwright tap @login-btn
slapwright type @email "user@test.com"
slapwright type @password "secret"
slapwright tap role:button "Sign In"

# 3. Wait for navigation
slapwright wait-url "/dashboard"

# 4. Verify
slapwright assert-text "Welcome back"

# 5. See the new state
slapwright peek
```

Every command is stateless (connects, acts, exits). Exit codes are meaningful (0 = success, 1 = element not found / assertion failed, 2 = error). Output is concise and parseable. This is what AI agents need.

## Tests

```bash
npm test          # Run all 72 tests
npm run test:watch  # Watch mode
```

## License

MIT -- see [LICENSE](LICENSE).

## Built by

[Arthur Ford, LLC](https://github.com/arthurfordllc)
