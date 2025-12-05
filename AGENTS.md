# Agents Guide

This project is a Next.js app that extracts proper names (people and places) from Bible verses using OpenAI, with data stored in a local SQLite DB backed by JSON files in `public/bible_data`.

## Capabilities
- Process a single verse, a full chapter, or an entire book with real-time UI updates (names appear as badges while processing).
- Classify names as `person` or `place`; exclude divinity references, generic nouns, and all demonyms.
- Prompt uses the previous verse as context; genealogies (even with the `-im` suffix) are treated as persons.
- Reprocess an individual verse (delete and recalc) and delete names from the explorer.
- On-demand usage stats (tokens/requests).

## Key paths
- UI logic: `components/BibleScraper.tsx`
- Actions/server logic: `app/actions.ts`
- OpenAI prompt and extraction: `lib/openai.ts`
- Bible data source: `public/bible_data/*.json`

## Environment
- Node 18+, `pnpm`
- `.env.local`:
  - `OPENAI_API_KEY`
  - `OPENAI_ADMIN_KEY` (optional, for admin usage stats)

## Run
```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

## Prompt contract (summary)
- Output strictly JSON: `{ "names": [{ "name": string, "type": "person" | "place" }] }`.
- Exclude divinity, generic nouns, phenomena, and demonyms.
- Use previous verse only as context; extract solely from the current verse.
- Genealogies: treat names as persons, including `-im` suffixed ancestors.

## Realtime processing notes
- Book processing auto-switches to the chapter being processed and streams verse statuses.
- Names sidebar merges incrementally; chapter/book stats refresh after each chapter.

## Troubleshooting
- If no names appear after reprocess, check server logs for `[OpenAI]` debug lines.
- If data changes in `public/bible_data`, restart dev server.
