# Trust IDE — HP-only AI coding workspace

**Status: early prototype.** Planned combination: VS Code-style web editor + Oh My Pi (OMP) + OpenAI Codex + cloud APK build. This is not a ready-to-install Android IDE yet.

## Start from an Android phone
1. Open this repository on GitHub.
2. Select **Code → Codespaces → Create codespace on main** (the repository now contains its first commit).
3. When Codespaces opens, use its built-in browser editor and terminal.
4. Keep the Codespaces port private. Never commit AI API keys.

The `.devcontainer/devcontainer.json` can configure a Node-based development container. Further application source will be added here.

## Architecture goal
- VS Code-like manual editing through the Codespaces editor in Chrome.
- Unified AI console calling OMP and Codex from the cloud runtime.
- Persistent agent state stored outside Git history.
- Gradle builds on the cloud machine or GitHub Actions, with APKs available to download.

**Security:** this GitHub repository is currently **public**. Switch it to private in repository Settings if it is intended only for personal use.
