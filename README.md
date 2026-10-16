# Trust IDE Mobile — Android-phone-first coding workspace

> **Status: active prototype (v0.2), NOT a final Android APK and NOT yet a Code-OSS fork.** This repo now has a responsive IDE-style screen, file explorer, tabbed manual code editor, unified agent interface, Node server, and a persistent agent-protocol bridge. Codex/OMP authentication, real integration tests, and Android SDK builds remain to be verified.

## Use it on a phone (Codespaces)

1. Open the GitHub repo **Code → Codespaces** and start a Codespace on **main**.
2. In the Codespaces terminal:
   \`\`\`bash
   git pull origin main
   npm start
   \`\`\`
   If the old server is running, stop it with **Ctrl+C** before starting the new one.
3. Open the forwarded **private** port **3000**, enter the token shown in terminal.
4. At bottom of the phone screen: **Files / Editor / AI Agent / Build**.
5. Select **Files → index.html** to edit the included sample page. Changes are saved to \`workspace/\` on the Codespace.

**Refresh both your Codespaces project and the port-3000 browser tab after pulling.** If an old server is still running, the old UI remains active until it is restarted.

## Enable OMP and Codex in Codespaces (optional)

Only if you want actual agent execution:

\`\`\`bash
bash scripts/install-agents.sh
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/npm/bin:$PATH"
codex --version
omp --version
\`\`\`

Then authenticate using the corresponding CLI's interactive login/setup, or your supported provider's secret mechanisms. **Never paste API keys into source files, chat prompts, Git commits, or screenshots.** After setting up credentials, restart \`npm start\` so the server inherits the updated environment.

Official CLI installation references:
- Codex: https://github.com/openai/codex
- Oh My Pi: https://github.com/can1357/oh-my-pi

### What Fusion mode does

The \`server/agents.js\` bridge is designed to run **OMP RPC** as a long-lived process, and **Codex app-server** as another long-lived process. A Fusion task first asks OMP to implement it and then asks Codex to review/fix the changes. Saved OMP sessions and the last Codex thread ID live in \`~/.trust-ide\`, not in the Git repo.

This has **not** been proven with both authenticated CLIs in a real Codespace yet. If either CLI is missing, the UI reports it instead of claiming success. This is not a general Code-OSS extension host, and there is not yet a full integrated terminal, debugger, or Monaco/LSP editor.

## Android APK build

The Build button runs \`./gradlew assembleDebug\` inside the \`workspace/\` directory when it contains an Android Gradle project. It **does not** install JDK/Android SDK for you. The sample \`workspace/index.html\` is a website example, not an Android project.

To build an actual APK, first add a full Android project with \`gradlew\`, install the Android SDK/JDK, and configure your Android dependencies. APK signing and downloading from the browser are future work.

## Security

- The repository was **public** when it was created. Do not commit secrets or private project data. Consider making it private via repository Settings.
- Keep Codespaces port **3000 private**. Trust IDE has a random login token and cookie authentication, but it has not undergone a security audit.
- Agents can execute code. Only run tasks and projects you trust.
- Codespaces can suspend automatically; running agents will stop when the VM stops.

## Tests

A GitHub Actions smoke workflow runs syntax checks and tests authentication, file operations, status, and build precondition behavior. Check the Actions tab for the actual outcome; **the existence of the workflow is not proof it has passed**.

## Planned next milestones

1. Validate real OMP RPC and Codex app-server sessions under Codespaces.
2. Improve editor toward a Code-OSS/Monaco workbench with syntax diagnostics and full project navigation.
3. Live agent transcript, diff/review approvals, Git checkpoints, and persistent job management.
4. Android toolchain + GitHub Actions APK artifacts and installable Android shell.
