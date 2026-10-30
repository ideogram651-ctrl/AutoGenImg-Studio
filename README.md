# AutoGenImg Studio (AI Image Workflow Studio)

**Local-first Desktop Web Application for Orchestrating AI Video Image Generation & Verifiable Workflows**

---

## 1. Overview & Workflow

AutoGenImg Studio automates the repetitive workflow of creating sequence images for videos (e.g. YouTube shorts, explainers, and long-form video essays):
1. **Prepare**: Follow the built-in 7-step guide to divide your video script into exact scene intervals (e.g., 120s video with 5s interval = 24 images).
2. **Master Prompt**: Generate an AI prompt that instructs your chosen AI (ChatGPT, Claude, Gemini) to return a structured JSON bundle matching Canonical Schema 1.0.
3. **Validate & Map**: Import the bundle into the studio, auto-validate unique prompt IDs, timing, and assign multi-category reference assets (character, style, environment, object).
4. **Execute**: Launch sequential browser automation using your **installed Google Chrome** via Chrome DevTools Protocol (CDP) with visible UI controls.
5. **Verify**: Download each generated image under its stable prompt ID (e.g. `IMG-001.png`), verify non-empty file presence on disk, and update the manifest.
6. **Review Center**: Any ambiguous outcomes or download interruptions are routed to human review without blind regeneration.
7. **Offline HTML Report**: Generates an independent, self-contained HTML report with wall-clock vs active processing metrics, per-prompt tables, and failure diagnostics.

---

## 2. Key Architecture & Features

- **Frontend**: React SPA styled with custom CSS variables and Tailwind CSS design tokens supporting Dark (default) and Light glassmorphic themes.
- **Backend**: Node.js & Express server running locally on `http://localhost:3000`.
- **Browser Automation Architecture**:
  - **Node.js application → Playwright CDP client → installed Google Chrome → visible website UI**.
  - Attaches to your local Google Chrome using Playwright's `chromium.connectOverCDP()`.
  - **No bundled Playwright Chromium executable required** for the live browser automation workflow.
- **Dedicated Persistent Profile (`./browser-profile/`)**:
  - Automation runs in an isolated, dedicated Chrome profile directory (`./browser-profile/`).
  - Completely preserves your manual login session between runs so you only need to log in once.
  - Keeps automation completely separate from your personal Chrome profile to satisfy modern Chrome remote-debugging security policies.
- **Two Distinct Execution Modes**:
  - **DEMO Mode (Simulation Adapter)**: Safe UI evaluation and dry-run without launching Chrome, requiring credentials, or consuming AI quotas.
  - **LIVE Mode (Installed Chrome via CDP)**: Drives visible prompt input, attachments, generation, and downloads in ChatGPT or Gemini with real authentication detection.
- **Progress Communication**: Server-Sent Events (SSE) streaming live state transitions, queue progress, and chronological event logs.
- **Persistence**: Durable local JSON manifests (`project.json`, `run-state.json`, `manifest.json`, `events.jsonl`, `settings.json`).
- **Startup Reconciliation**: Reconciles saved manifest entries with actual files on disk to prevent false positives or silent overwrites.

---

## 3. Application Pages

1. **Home / Projects Dashboard**: Overview metric cards (Total Prompts, Saved Images, Needs Review, Failed, Queue Status), 1-click 24-prompt demo loader, and live activity feed.
2. **Project Settings**: Configure authoritative output folder, execution mode/provider, target conversation URL, and interval calculations.
3. **How to Use / Guided Workflow**: 7-step interactive tutorial with built-in copyable Master Prompt Builder.
4. **Prompt Bundle Manager**: Import, validate, filter, and inspect prompt sequence and timing ranges.
5. **Reference Manager**: Manage style, character, environment, and object reference files and assign them to all or selected prompt IDs.
6. **Run Monitor**: Live operational dashboard displaying active prompt sequence, stage, percentage, controls (Start, Pause, Resume, Stop), and event log stream.
7. **Review Center**: Exception resolution center providing Retry Download, Mark Reviewed, Skip, and deliberate New Generation.
8. **Reports & History**: Interactive viewer for self-contained HTML run reports with wall-clock vs active timings.
9. **Settings**: Theme appearance, installed Google Chrome session management (Detect Chrome, Open Chrome for Login, Check Connection, Disconnect), dedicated profile configuration, timeouts, and local security assurances.

---

## 4. How to Run Locally on Windows

### Prerequisites
- **Node.js**: 18+, 20+, or 22+ installed on your computer.
- **Google Chrome**: Standard Google Chrome installed on your Windows computer.

> [!NOTE]
> `npx playwright install chromium` is **not required** for normal live operation because AutoGenImg Studio connects directly to your installed Google Chrome via Chrome DevTools Protocol (CDP).

### Step-by-Step Setup Instructions

1. **Open your terminal** (Command Prompt or PowerShell) and navigate to the project directory:
   ```powershell
   cd e:\autogenimg-studio
   ```

2. **Install project dependencies**:
   ```powershell
   npm install
   ```

3. **Verify Google Chrome Installation**:
   - Google Chrome is automatically detected from standard Windows paths (`C:\Program Files\Google\Chrome\Application\chrome.exe`, `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`, `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`).
   - If your Chrome executable is in a custom location, you can set the `CHROME_PATH` environment variable:
     ```powershell
     $env:CHROME_PATH="C:\CustomPath\chrome.exe"
     ```
     or configure it directly in the **Settings** page.

4. **Start the local server**:
   ```powershell
   npm run dev
   ```

5. **Open AutoGenImg Studio**:
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

6. **Initialize Your Chrome Session for Login**:
   - In the left sidebar, click **Settings**.
   - Under the **Installed Google Chrome Session (CDP)** card, click **Detect Chrome** to verify your Chrome path.
   - Click **Open Chrome for Login**.
   - An independent Google Chrome window will appear using the dedicated profile (`./browser-profile/`).

7. **Log In Manually in Chrome**:
   - Inside the opened Chrome window, log in to your **ChatGPT** or **Google Gemini** account.
   - Complete any required two-factor authentication or CAPTCHAs manually.
   - Because AutoGenImg Studio uses the dedicated profile directory, **your session remains saved for future runs**.

8. **Verify Session Readiness**:
   - Switch back to the AutoGenImg Studio tab in Settings.
   - Click **Check Connection / Readiness**.
   - You should see `YES (READY)` indicating the prompt input is accessible and authenticated.

9. **Run a Test**:
   - Click **Dashboard** → **"Load 24-Prompt Demo"** to test with the Simulation adapter, or configure a project with `ChatGPT` / `Gemini` provider.
   - Navigate to **Run Monitor** and click **Start Run**.

---

## 5. Security & Safety

- **Local-only execution**: Binds strictly to loopback (`127.0.0.1`); does not expose remote debugging ports to the external network.
- **Dedicated Persistent Profile**: Uses `./browser-profile/` instead of your everyday personal Chrome profile.
- **Zero Credential Scraping**: AutoGenImg Studio never accesses, copies, or stores passwords, session tokens, or raw cookies. You authenticate directly and securely in the visible Chrome window.
- **Graceful Error Handling**: If authentication expires or provider limits are reached, execution pauses safely with `BLOCKED_AUTH` or `PAUSED_PROVIDER_LIMIT`, preserving all generated assets and manifests.
- **Safe Process Lifecycle**: Disconnecting the controller detaches Playwright safely without killing your active Chrome windows.
