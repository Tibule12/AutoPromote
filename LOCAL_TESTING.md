# Local testing with the Firestore emulator

This repository includes several emulator-backed unit and integration tests that require the Firestore emulator to be available.

Recommended quick commands:

- Run emulator-backed unit tests (root):

  npm run test:emulator

- Seed a minimal dataset into the emulator (useful for manual smoke tests):

  npm run seed:emulator

Tips:

- The test script uses `firebase emulators:exec` which requires a JDK (Java 21+) for the emulator. If you get an error about Java, install Temurin/OpenJDK 21.
- For Playwright E2E tests that rely on emulator data, see the `test:e2e:playwright` scripts in `package.json` (they wrap the emulator run).
- Use `npx firebase emulators:start --only firestore` to run a long-lived local emulator instance and then run tests against it in another terminal if you prefer.

CI note

- There's a GitHub Actions workflow that runs emulator-backed tests on PRs: `.github/workflows/test-emulator.yml`.
