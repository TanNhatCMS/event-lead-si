# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains product planning artifacts rather than application code. The active feature is under `specs/001-event-lead-platform/`: `spec.md` describes requirements, `plan.md` captures the implementation design, and `checklists/requirements.md` holds a review checklist. Feature work may add `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, and `tasks.md` in that same feature directory. `.specify/` contains Spec Kit templates, workflow definitions, and helper scripts; `.agents/skills/` contains repository-specific agent workflows. Keep generated feature artifacts together and avoid placing product source or tests in these tooling directories.

## Build, Test, and Development Commands

No application build, runtime, or test command is configured yet because the implementation stack has not been scaffolded. The available helper scripts are Python and PowerShell equivalents. For example:

- `python .specify/scripts/python/check_prerequisites.py --help` — inspect feature workflow prerequisites/options.
- `python .specify/scripts/python/setup_plan.py --help` — inspect plan setup options.
- `python .specify/scripts/python/setup_tasks.py --help` — inspect task setup options.

Use `pwsh .specify/scripts/powershell/<script>.ps1` for the PowerShell versions. Check each script's help before running it; workflow scripts may create or update artifacts.

## Documentation Style

Write planning artifacts in Markdown with descriptive headings, short actionable statements, and relative paths from the repository root. Feature directories use a three-digit sequence and kebab-case name, such as `001-event-lead-platform`. Keep requirements and design aligned with `.specify/memory/constitution.md`; clearly distinguish verified facts, user-provided data, and uncertain or AI-inferred claims. Document consequential actions as requiring explicit human approval.

## Testing Guidelines

There is no test framework or coverage threshold in the current scaffold. For documentation changes, check that links and paths resolve, requirements remain consistent across the spec, plan, and checklist, and examples match the actual scripts. When application code is introduced, add its test commands and naming conventions here alongside the chosen framework.

## Commit & Pull Request Guidelines

Git metadata and commit history are not available in this checkout, so no existing commit convention could be confirmed. Use concise imperative commit subjects (for example, `docs: clarify contact review flow`) until maintainers establish a repository-specific convention. Pull requests should summarize the change, identify affected feature artifacts, link related work when available, and note validation performed. Include screenshots only when a UI is part of the change.

## Security & Configuration

Never commit secrets, privileged credentials, or real contact/event data. Any future database changes should be versioned and reviewed, and access boundaries must follow the project constitution, including organization-level authorization and server-only privileged credentials.
