# cleanup-007: Remove singular skill-pool setter wrapper

- **Feature:** Remove the unused one-use `setSkillPoolDir()` wrapper and call the existing plural setter directly.
- **Branch:** `main`
- **Implementation:** Deleted the singular function from `src/core/config.ts`; changed `runTui()` and config tests to call `setSkillPoolDirs([value])`.
- **Preserved:** Single-directory trimming, blank validation/error, atomic persistence, environment handling, unrelated config fields, and skill-pool UI flow.
- **Verification:** Focused config/run-TUI tests passed **31/31**; ephemeral source-compiled suite passed **615/615**; `npm run typecheck` and `git diff --check` passed; repository search found no singular references; code critic and second opinion returned LGTM.
- **Reflection:** No durable documentation changes required; internal wrapper removal does not affect architecture or user guidance.
