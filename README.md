# Trust IDE Mobile — HP-only prototype

An early, lightweight browser IDE starter for Android phone users. **Not a full VS Code / Code-OSS fork or a built APK yet.** This repository has a minimal editor panel, server endpoints, and scaffolding for invoking AI CLI commands. It does **not** yet have OMP RPC sessions, Codex app-server threads, durable two-agent orchestration, or an APK workflow. A more complete prototype ZIP is available separately in the original ChatGPT conversation and has not yet been imported here.

## Start from Android Chrome
1. Open the repository GitHub page, select **Code → Codespaces → Create codespace on main**. The repository contains commits, so the empty repository blocker is resolved.
2. When the Codespace opens, open its terminal. Run `npm start`.
3. In the Ports tab, find port **3000** and open its **private** forwarded URL.
4. Copy the **Login token** printed in the terminal and enter it on the login screen.
5. Use the file editor. Agent buttons require the OMP/Codex CLIs installed and configured separately on the cloud VM. They are not installed automatically, and both agent calls are experimental; don't assume they work out of the box.
6. APK build requires an Android project with a valid executable Gradle wrapper in `workspace/`, plus a configured JDK and Android SDK.

## Security / limitations
- The GitHub repository was **public** at setup time. Consider making it private under Settings → General → Danger Zone → Change visibility.
- Port 3000 should remain private. Never commit API keys, auth tokens, Android keystores, or secrets.
- The interface is an early prototype. Its file operations and agent permissions have not been security-audited. Do not expose the app as a public service.
- Codespaces may pause due to inactivity. It is not an always-on agent server.
- GitHub's screenshot displayed a warning to enable **two-factor authentication (2FA)** before October 20, 2026 to avoid account restrictions.

## Longer-term architecture
Code-OSS browser editor + unified OMP RPC and Codex app-server backend + persistent sessions + Git-based checkpoints + Android SDK/Gradle cloud build + APK downloads.

The goal is a single IDE usable entirely from a phone, with manual editing and optional autonomous programming.
