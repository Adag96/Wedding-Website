# Claude Lessons

Lessons learned while working on this project. Claude should consult this file at session start and add entries when corrections are made or non-obvious solutions are discovered.

## Entry Format
- **Date**: YYYY-MM-DD
- **Category**: (workflow | debugging | tooling | project-specific)
- **What happened**: Brief description
- **Rule**: Concrete rule to follow

---

## Lessons

### 2026-03-02 | tooling | Localtunnel password not provided
**What happened**: When starting a localtunnel (`npx localtunnel --port <port>`) to test local changes on mobile, I only provided the URL but not the tunnel password. User had to ask for it separately.

**Rule**: When using localtunnel for mobile testing, ALWAYS fetch and provide the tunnel password immediately after getting the URL. Get it with: `curl -s https://loca.lt/mytunnelpassword`. Provide both the URL and password together so the user can test immediately without follow-up questions.

### 2026-03-03 | workflow | Failed to check project-local lessons file at session start
**What happened**: Global instructions say to read the project's lessons file at session start. I looked in the global Claude projects path (`~/.claude/projects/...`) instead of checking the project's own `.claude/` directory first. This caused me to repeat the localtunnel password mistake that was already documented.

**Rule**: At session start, ALWAYS check for `.claude/Claude-Lessons.md` in the project working directory FIRST before looking elsewhere. The project-local lessons file takes priority.
