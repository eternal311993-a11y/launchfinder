# LaunchFinder AI

AI-powered business name and domain idea generator designed to monetize qualified domain/hosting purchase intent.

## Run

```bash
npm install
npm start
```

Optional: set `OPENAI_API_KEY` for AI-generated names. Without it, the app has a deterministic fallback generator.

## Deploy

The included `render.yaml` is ready for Render. Add `OPENAI_API_KEY` as a secret environment variable.

> Domain suggestions are not availability claims. Availability must be verified by the registrar.
