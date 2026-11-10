# JUMBO GO source handover

Source snapshot prepared on 2026-11-10. Next.js, React, TypeScript and libSQL.

## Setup

Use Node.js 24 and npm. Install with `npm ci`, then configure the required environment variables using the provider accounts owned by the operator. Obtain credentials through a secure channel.

Run `npm run dev` for local development or `npm run build` followed by `npm start` for a production build. The development runner may create local data and certificates. Use dedicated test configuration for the sandbox.

## Checks

`npm run typecheck`, `npm run lint` and `npm test` are the core checks. Review the QA script before running it against a shared environment.

## Contents

- `src` contains application pages, components and server logic.
- `public` contains assets used by the website, including PWA resources.
- `database` contains schema files. Check server migration code for the application's current storage behavior.
- `scripts` contains selected build, development, maintenance and test entry points.
- `tests` contains automated tests.

This snapshot excludes environment files, database records, credentials, account-cleanup scripts, local tool installations, build artifacts and separately produced marketing outputs. Public website assets remain included so the frontend can run.

Production provider configuration and deployment identity must be supplied separately by the operator. This source snapshot does not establish current production verification status. Licensing and transfer rights follow the parties' signed agreement.
