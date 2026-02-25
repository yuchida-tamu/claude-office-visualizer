# CI/CD Pipeline Data Flow

## Overview

Two GitHub Actions workflows automate quality checks and releases:
1. **PR Check** — validates every pull request before merge
2. **Build & Publish** — triggered by version tags, publishes to npm and updates the plugin marketplace

---

## PR Check Workflow

```mermaid
flowchart LR
    subgraph trigger["Trigger"]
        PR["Pull Request → main"]
    end

    subgraph job["Job: check"]
        checkout["actions/checkout@v4"]
        bun["oven-sh/setup-bun@v2"]
        install["bun install --frozen-lockfile"]
        typecheck["bun run typecheck<br/>(tsc --build)"]

        subgraph tests["Unit Tests (4 packages)"]
            tc["client: bun test"]
            ts["server: bun test"]
            th["hooks: bun test"]
            tcli["cli: bun test"]
        end
    end

    PR --> checkout --> bun --> install --> typecheck --> tests
```

---

## Build & Publish Workflow

```mermaid
flowchart TD
    subgraph trigger["Trigger"]
        tag["Push tag v*<br/>(e.g. v1.2.3)"]
    end

    subgraph job1["Job 1: test"]
        t_checkout["Checkout"]
        t_bun["Setup Bun"]
        t_install["bun install --frozen-lockfile"]
        t_typecheck["bun run typecheck"]
        t_tests["Run all 4 test suites"]
    end

    subgraph job2["Job 2: publish"]
        p_checkout["Checkout"]
        p_bun["Setup Bun + Node.js"]
        p_install["bun install --frozen-lockfile"]
        p_version["Extract version from tag<br/>v1.2.3 → 1.2.3"]
        p_bump["bun run scripts/bump-version.ts VERSION<br/>Updates: package.json, plugin.json"]
        p_build["bun run build:publish<br/>(9-stage pipeline → dist/)"]
        p_publish["cd dist && npm publish<br/>Auth: NPM_TOKEN secret"]
    end

    subgraph job3["Job 3: update-marketplace"]
        m_checkout["Checkout yuchida-tamu/my-agent-skills<br/>Auth: MARKETPLACE_PAT"]
        m_update["Update marketplace.json<br/>claude-office-visualizer version → ^1.2.3"]
        m_pr["Create PR to my-agent-skills"]
    end

    tag --> job1
    job1 -->|"needs: test"| job2
    job2 -->|"needs: publish"| job3

    t_checkout --> t_bun --> t_install --> t_typecheck --> t_tests
    p_checkout --> p_bun --> p_install --> p_version --> p_bump --> p_build --> p_publish
    m_checkout --> m_update --> m_pr
```

---

## Version Bump Data Flow

```mermaid
flowchart LR
    tag["Git tag: v1.2.3"] --> extract["Strip 'v' prefix → 1.2.3"]
    extract --> bump["scripts/bump-version.ts"]

    bump --> pkg["package.json<br/>.version = '1.2.3'"]
    bump --> plugin[".claude-plugin/plugin.json<br/>.version = '1.2.3'"]

    pkg --> build["build-publish.ts<br/>reads VERSION from package.json"]
    build --> dist["dist/package.json<br/>.version = '1.2.3'"]
```

---

## Required Secrets

| Secret | Used In | Purpose |
|--------|---------|---------|
| `NPM_TOKEN` | Job 2: publish | npm registry authentication |
| `MARKETPLACE_PAT` | Job 3: update-marketplace | GitHub PAT with repo scope for `yuchida-tamu/my-agent-skills` |
