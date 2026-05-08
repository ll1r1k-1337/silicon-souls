# Specs

This folder stores exported or hand-authored specification documents. The Stage 0 runtime stores active source-of-truth artifacts and snapshots in PostgreSQL.

## UI design tokens and theming rules

- Tokens are layered in three levels:
  - **Primitive tokens** (`--gray-900`, `--teal-400`) define raw palette values.
  - **Semantic tokens** (`--surface-default`, `--text-primary`, `--border-subtle`) define purpose-driven roles.
  - **Component tokens** (`--btn-primary-bg`, `--badge-bg`) are final mappings for concrete UI elements.
- Components in `apps/web/src/shared/ui/*.vue` and shared layouts must use semantic/component tokens only.
- Direct hex/rgb colors in component styles are allowed only for:
  - legacy migration hotspots with TODO,
  - third-party integration constraints,
  - one-off visual effects (must be documented in code comment).

## Theme switching policy

- Themes are declared through root data-attributes:
  - `:root[data-theme='dark']`
  - `:root[data-theme='light']`
- UI state stores **user preference** as `dark | light | system`.
- If `system` is selected, runtime must resolve via `prefers-color-scheme` and react to OS changes.
- Theme switching is centralized in `uiStore` via `document.documentElement.dataset.theme`; avoid per-component theme mutation.

## Industry best-practice guardrails

- Respect user/OS preference first (`prefers-color-scheme`) and only override with explicit in-app choice.
- Keep `color-scheme` aligned with active theme to improve native control rendering.
- Keep semantic tokens role-based (not hue-based names) so future rebrand/retheme is low-risk.
- Validate contrast in both themes for body text, muted text, and status colors before merging visual changes.
