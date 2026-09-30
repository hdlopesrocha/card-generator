# Card Generator

A standalone, client-side game card generator built with Vue 3, TypeScript and Vite. Create, edit, preview and print trading/strategy style cards with three zone themes. **No backend is required**: there is no server, no REST API and no database server. Everything runs in the browser, and all data is stored locally with IndexedDB.

## Prerequisites

- Node.js 20.19+ or 22.12+ (tested with Node 24) - required by Vite 8.
- npm, which ships with Node.js.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Starts the Vite development server with hot module replacement. The application is served as a pure client-side SPA; routes use HTML5 history and navigation never reloads the page.

## Production build

```bash
npm run build
```

Runs `vue-tsc --noEmit` for type checking and then produces an optimized bundle in `dist/`. The type check is also available on its own through `npm run typecheck`.

## Preview production build

```bash
npm run preview
```

Serves the generated `dist/` folder locally through Vite.

## Deployment to GitHub Pages

The project ships a deploy script that publishes the production build to the `gh-pages` branch:

```bash
npm run deploy
```

It runs `npm run build:pages`, which builds with the `/card-generator/` base path required by project pages, then copies `index.html` to `404.html` (so client-side routes survive a refresh) and adds `.nojekyll`, and finally pushes `dist/` to the `gh-pages` branch.

One-time setup: in the repository on GitHub, open **Settings -> Pages -> Build and deployment**, choose **Deploy from a branch**, and select the `gh-pages` branch with the `/ (root)` folder. The app is then available at:

```text
https://<user>.github.io/<repository>/
```

If you host the build at a domain root instead (custom domain or user page), use `npm run build` and serve `dist/`.

## Tests

```bash
npm test
```

Runs the Vitest suite once (`vitest run`); `npm run test:watch` runs it in watch mode. Vitest is configured in `vite.config.ts` with the `jsdom` environment and loads `tests/**/*.spec.ts`. Current suites:

- `tests/validation.spec.ts` - card validation rules and `parseStatValue` (required fields, numeric ranges, length limits, translation length limits, zones, image data URLs) plus localized error messages.
- `tests/storage.spec.ts` - `IndexedDbCardRepository` create/read/update/delete, bulk writes, transaction rollback and database isolation using `fake-indexeddb`.
- `tests/backup.spec.ts` - backup serialization/parsing, malformed and incompatible files, card validation, translation round-tripping (legacy backups default to empty translations) and id handling.
- `tests/image.spec.ts` - extension, MIME type and magic-byte detection, size limits and data URL conversion.
- `tests/imageLibrary.spec.ts` - `IndexedDbImageRepository` CRUD and the image library store: multi-upload, unique names, partial failures and deletion.
- `tests/imageView.spec.ts` - the Images page: bundled sample listing, multi-file upload and confirmed deletion.
- `tests/pdf.spec.ts` - valid non-empty PDF output with one page per card, exact card-size pages with no margins, custom dimensions, filename sanitization, the download flow and localized export (translated text rendered, English fallback).
- `tests/csv.spec.ts` - CSV parsing: the bundled `sample.csv`, quoted fields, delimiters, BOM/CRLF, required columns, invalid row reporting, data URL and bundled-asset images, translations and CSV round-tripping.
- `tests/localization.spec.ts` - message catalog completeness across all seven languages, `translate` interpolation and fallback, per-field English fallback in `getLocalizedCard`, language store persistence and invalid values, and demo card translations.
- `tests/app.integration.spec.ts` - mounts the real views in jsdom: demo card seeding, live preview updates (title, action, zone themes), save validation, delete confirmation, export dialog selections and the CSV import/export flow.
- `tests/languageFlow.spec.ts`, `tests/languageSwitching.spec.ts` - end-to-end language behavior: the picker updates cards live and list, editor preview and PDF all use the selected language.
- `tests/selectedLanguageEditing.spec.ts` - creating and saving a card written only in the selected (non-English) language.
- `tests/csvLanguageFlow.spec.ts`, `tests/csvImages.spec.ts` - importing `sample.csv` through the UI with translations and bundled artwork, then exporting a PDF in the selected language.
- `tests/demoMigration.spec.ts` - legacy demo cards stored before translations existed are upgraded in place.

## Project structure

```text
card-generator/
├── index.html                  Application HTML entry point
├── package.json                Scripts and dependencies
├── sample.csv                  Example CSV with the three demo cards
├── vite.config.ts              Vite + Vitest configuration (@ alias, jsdom)
├── tsconfig.json               Strict TypeScript configuration
├── src/
│   ├── main.ts                 Creates the Vue app, installs Pinia and the router
│   ├── App.vue                 Application shell (header with the language picker, navigation, router outlet)
│   ├── vite-env.d.ts           Vite type declarations
│   ├── components/             Reusable UI components
│   │   ├── AppNavigation.vue   Sidebar navigation
│   │   ├── CardEditorForm.vue  Card form with language tabs and inline validation
│   │   ├── CardImage.vue       Artwork renderer with placeholder fallback
│   │   ├── CardListItem.vue    List entry with edit/preview/PDF/delete actions
│   │   ├── CardPreview.vue     Full card design used by previews and export
│   │   ├── CardStats.vue       Attack/defense stat panel
│   │   ├── CardZoneBadge.vue   Zone label badge
│   │   ├── ConfirmDialog.vue   Accessible confirmation dialog
│   │   ├── EmptyState.vue      Empty collection placeholder
│   │   ├── ExportDialog.vue    PDF export dialog (card selection)
│   │   ├── ImageUploader.vue   Drag-and-drop image input
│   │   ├── LanguageFlag.vue    Inline SVG flags for the language picker
│   │   └── LanguagePicker.vue  Flag language selector shown in the app header
│   ├── assets/                 Sample artwork used by CSV imports (img1-img3.jpeg)
│   ├── config/
│   │   ├── constants.ts        Validation limits, image, PDF, storage and backup constants
│   │   ├── languages.ts        Localized UI messages, card labels and zone labels
│   │   └── zones.ts            Centralized zone theme metadata and colors
│   ├── data/
│   │   └── sampleCards.ts      Demo cards with translations for every language
│   ├── models/
│   │   ├── Card.ts             Card interface, Zone enum, translations and helpers
│   │   └── Language.ts         Supported language codes, names and defaults
│   ├── router/
│   │   └── index.ts            Client-side route definitions
│   ├── services/
│   │   ├── backup/backupService.ts           JSON backup export/import and validation
│   │   ├── csv/csvService.ts                 CSV parsing, row validation and generation
│   │   ├── image/bundledImages.ts            Lazy loader for sample artwork referenced by CSV
│   │   ├── image/imageService.ts             Image validation and JPEG re-encoding
│   │   ├── localization/cardLocalization.ts  Per-language card text with English fallback
│   │   ├── pdf/cardPdfService.ts             In-browser PDF renderer (pdf-lib)
│   │   ├── storage/indexedDb.ts              IndexedDB repositories (cards and images)
│   │   └── validation/cardValidation.ts      Card field and translation validation
│   ├── stores/
│   │   ├── cardStore.ts        Pinia store for the card collection and CRUD
│   │   ├── imageLibraryStore.ts Pinia store for the local image library
│   │   ├── languageStore.ts    Pinia store for the selected language (localStorage)
│   │   └── settingsStore.ts    Pinia store for user settings (localStorage)
│   ├── styles/
│   │   ├── variables.css       Design tokens (colors, spacing, zone palettes)
│   │   ├── application.css     Shell, forms, list, editor and dialog styles
│   │   └── card.css            Card visual design and zone themes
│   └── views/
│       ├── CardListView.vue    Card collection with export and delete actions
│       ├── CardEditorView.vue  Form plus live preview for new/edit cards
│       ├── CardPreviewView.vue Large preview page for a single card
│       ├── ImageView.vue       Image library with multi-upload and CSV references
│       └── SettingsView.vue    PDF settings, backup/import and local data tools
└── tests/
    ├── app.integration.spec.ts Mounts the real views: demo seeding, preview, save/delete and CSV flow
    ├── backup.spec.ts          Backup serialization/parsing tests
    ├── csv.spec.ts             CSV parsing and generation tests
    ├── csvImages.spec.ts       Bundled sample artwork import and PDF embedding
    ├── csvLanguageFlow.spec.ts UI CSV import with translations and language-specific PDF
    ├── demoMigration.spec.ts   Legacy demo card translation upgrade
    ├── image.spec.ts           Image validation and detection tests
    ├── imageLibrary.spec.ts    Image repository and library store tests
    ├── imageView.spec.ts       Image page: sample listing, multi-upload and delete
    ├── languageFlow.spec.ts    Live language switching across list, editor and PDF
    ├── languageSwitching.spec.ts Language picker updates cards without reloading
    ├── localization.spec.ts    Message catalog, translate fallback, language store and demo translations
    ├── pdf.spec.ts             PDF generation, pagination, localization and download tests
    ├── selectedLanguageEditing.spec.ts Creating cards in a non-English language
    ├── storage.spec.ts         IndexedDB repository tests (fake-indexeddb)
    └── validation.spec.ts      Card validation tests
```

## Architecture

The dependency direction is:

```text
Vue components  ->  Pinia stores  ->  services  ->  IndexedDB / PDF
```

- Components render state and emit events; they never talk to IndexedDB directly.
- Pinia stores (`cardStore`, `languageStore`, `settingsStore`) own the collection, loading/saving/error state, the selected language, settings and CRUD orchestration.
- Services encapsulate persistence (`services/storage`), images (`services/image`), validation (`services/validation`), backup (`services/backup`), localization (`services/localization`) and PDF rendering (`services/pdf`).
- **No backend, REST API or database server is used.** All data is created, stored and exported in the browser.

## Local persistence (IndexedDB)

- Database: `card-generator`, version 1, with a single object store named `cards`, keyed by the card `id`.
- Repository: `IndexedDbCardRepository` in `src/services/storage/indexedDb.ts` exposes `init`, `getAll`, `get`, `put`, `bulkPut`, `delete`, `clear` and `count`. A shared instance is provided by `getCardRepository()`, so the rest of the application does not depend on IndexedDB details.
- IndexedDB is used instead of `localStorage` because card images are stored as base64 data URLs, which can exceed the roughly 5 MB `localStorage` quota; IndexedDB supports much larger structured data, asynchronous access and transactional writes (a failing `bulkPut` rolls back).
- Cards survive page refreshes and browser restarts, and remain scoped to the browser and origin that created them.
- Failures are surfaced as `StorageUnavailableError` or a friendly generic error; the stores present localized, readable messages (the raw storage error text is "Local storage is not available in this browser.") and log technical details to the console.
- Demo cards are seeded on first launch: when the database is empty and the `card-generator:demo-seeded` flag is absent, the store writes `Warrior` (ATTACK), `Tactician` (MIDFIELD) and `Guardian` (DEFENSE) from `src/data/sampleCards.ts`. The demo cards are regular cards, include translations for all six non-English languages, and can be edited or deleted.

## Image handling

- Accepted formats: PNG, JPEG and WebP.
- Maximum file size: 5 MB (`IMAGE_CONSTRAINTS.maxSizeBytes`).
- Validation is layered: file extension, MIME type and magic bytes (`detectImageType` inspects the file header), so renaming another file type to `.png`/`.jpg`/`.webp` is rejected.
- Accepted uploads are re-encoded locally to JPEG on a canvas to keep storage small:
  - the largest edge is capped at 1400 px (`IMAGE_CONSTRAINTS.maxDimensionPx`), smaller images are not upscaled;
  - the JPEG quality comes from the image quality setting (default 0.85, range 0.5-1.0);
  - both dimensions are scaled by the same factor, so the aspect ratio is always preserved.
- The result is stored as a `data:image/jpeg;base64,...` data URL on the card, so no object URL or filesystem path is persisted, and no filesystem access is required after the file picker closes. Decoding uses `createImageBitmap` with an `<img>` fallback.
- If no image is selected, or the stored data cannot be decoded, `CardImage.vue` and the PDF renderer fall back to a themed placeholder showing the card initial and a "No artwork" label (localized with the selected language).

## Image library

The **Images** page (`/images`, `src/views/ImageView.vue`) manages the artwork available to cards and CSV imports:

- **Sample images**: the files shipped in `src/assets` (`img1.jpeg`, `img2.jpeg`, `img3.jpeg`) are listed with thumbnails and are read-only.
- **My images**: upload one or more PNG, JPEG or WebP files at once (5 MB each). Every file is validated with the same extension, MIME and magic-byte checks as card uploads, re-encoded to JPEG with the configured image quality, and stored in the IndexedDB `images` store through `IndexedDbImageRepository` (`src/services/storage/indexedDb.ts`, database `card-generator`, version 2).
- Duplicate file names are made unique automatically (`art.png`, `art-1.png`, ...).
- Each entry has a **Copy file name** button; uploaded entries can be deleted behind a confirmation dialog. Deleting an image only removes it from the library; cards already using it keep their own embedded copy.
- CSV imports resolve the `image` column against both the bundled sample images and the local library, by file name (for example `img1.jpeg` or `hero.png`). The matched file is stored on the card as a data URL, so it survives backups and is embedded in PDFs.

## PDF generation

PDFs are generated fully in the browser with `pdf-lib`; no screenshots or canvases are used. `src/services/pdf/cardPdfService.ts` reproduces the card design with vector primitives and explicit dimensions:

- Page size: exactly the physical card size, 63 x 88 mm by default (`PDF_CONSTANTS`), with zero page margins.
- One card per page: exporting N cards produces an N-page document. Each page is the card itself, so the artwork fills the page edge to edge (full bleed) with no margins, gaps or rounded outer corners.
- Physical dimensions are configurable in Settings and used for both the on-screen aspect ratio and the PDF page size.
- Every visual element is drawn: zone gradient background, frame and corner accents, zone badge, title and subtitle, artwork (cover-fitted and clipped to rounded corners), attack/defense panels, the action panel and the 1-3 star rating at the bottom. Colors come from `src/config/zones.ts`, so the web preview and the PDF stay consistent.
- The PDF is rendered in the language selected in the header (English by default): translated title, subtitle and action are resolved with English fallback, and the zone badge, Attack/Defense stat labels, Action heading, "No artwork" and "Untitled Card" labels are localized too. The embedded standard Helvetica fonts use WinAnsi encoding, so accented Latin characters such as `ç`, `ã`, `é`, `ñ` or `ü` are exported correctly.
- Titles shrink and wrap up to two lines with ellipsis, and the action text wraps and adjusts its font size (down to 4.5 pt) to fit. Characters that `pdf-lib` cannot encode are replaced with `?`.
- Artwork is embedded as PNG or JPEG from the stored data URL. WebP data URLs (only possible through imported backups) and corrupt payloads fall back to the placeholder instead of breaking the export.
- Filenames are sanitized (`sanitizeFilename`): lowercase, non-alphanumeric characters collapsed to `-`, trimmed to 80 characters, with `card` as fallback. Single-card exports use the stored card title (`<title>-card.pdf`, for example `fire-drake-card.pdf`; the base title is used even when exporting in another language); multi-card exports use `cards-YYYY-MM-DD.pdf`.
- Downloads use a temporary blob URL, which is revoked after the click.

Available operations: export the current card (editor, preview page or list entry), export selected cards from the export dialog, or export all cards at once.

## Card design and zone themes

- Zones are strongly typed by the `Zone` enum (`ATTACK`, `MIDFIELD`, `DEFENSE`) in `src/models/Card.ts`.
- Zone themes: ATTACK is red, MIDFIELD is green, DEFENSE is blue.
- `src/config/zones.ts` centralizes the zone theme metadata: CSS class name, primary/accent colors, gradient endpoints, panel colors, text colors and badge colors. Localized zone labels and descriptions live in `src/config/languages.ts` (`ZONE_LABELS`, `getZoneLabel`). `src/styles/variables.css` defines the matching `--zone-*` CSS variables and `src/styles/card.css` maps them to the `.zone-attack`, `.zone-midfield` and `.zone-defense` classes used on the card root.
- `CardPreview.vue` composes the card from reusable components (`CardImage`, `CardStats`, `CardZoneBadge`) and applies gradients, a textured background, decorative frame geometry, an artwork glow, stat panels, an action panel, a zone badge and a 1-3 star rating at the bottom of the card. The zone label is always rendered as text on the card, in the selected language.
- Adding a new zone touches three centralized places: `src/config/zones.ts`, `src/config/languages.ts` (zone labels) and `src/styles/variables.css` (plus the `Zone` enum and the matching `card.css` class); components and the PDF renderer read the shared configuration instead of hard-coding zone values.

## Languages

The application ships with seven languages: English (the default), Portuguese, French, Spanish, German, Dutch and Italian. It does not use a third-party i18n framework; a typed message catalog in `src/config/languages.ts` plus a `translate` helper provide every string, and the language codes are defined in `src/models/Language.ts` (`LANGUAGES`, `DEFAULT_LANGUAGE`).

- A single language picker in the application header (`src/components/LanguagePicker.vue`, flags drawn with inline SVGs in `LanguageFlag.vue`) controls the whole app: navigation, buttons, dialogs, form labels, status messages, validation errors and the text rendered on cards.
- The choice is persisted in `localStorage` under `card-generator:language` by `src/stores/languageStore.ts` and restored on the next visit; missing or invalid stored values fall back to English.
- Cards store their English text in the base `title`, `subtitle` and `action` fields. Other languages live in `card.translations`, keyed by language code (PT, FR, ES, DE, NL, IT). Missing or empty translations fall back to English per field, both on screen and in the PDF (`src/services/localization/cardLocalization.ts`), so partially translated cards always render completely.
- Localized card labels include the zone badge (Attack/Midfield/Defense), the Attack and Defense stat labels, the Action heading, "No artwork" and "Untitled Card".
- The card editor shows one tab per language. The English tab edits the base fields; every other tab edits that language's title, subtitle and action, shows the English text as the placeholder for empty fields and offers a **Copy English text** button.
- Validation follows the same fallback: while a non-English language is selected, a card can be created and saved using only that language's text. When saving, if the English base fields are still empty, the selected language's text is also stored as the base so the card renders completely in every language.
- The card list marks cards without a translation for the selected language with a small `EN` chip explaining that English is being shown, so a missing translation is never mistaken for a bug.
- The demo cards ship with all six translations, so switching the picker immediately shows localized cards. Demo cards stored by older versions (before translations existed) are upgraded in place on the next load when their text is still the original one.

## Validation

Rules are centralized in `src/config/constants.ts` (`CARD_LIMITS`) and enforced by `src/services/validation/cardValidation.ts`:

- Required: title, attack, defense, action and zone. Stars default to 1.
- Attack and defense must be numbers between 0 and 999.
- Stars must be a whole number between 1 and 3 and are displayed at the bottom of the card and in the PDF.
- Title maximum 60 characters; action maximum 240 characters; subtitle is optional but limited to 80 characters.
- Translated title, subtitle and action are checked against those same limits (60/80/240 characters); a single `translations` error is shown when any translation exceeds them.
- A stored image must be a PNG, JPEG or WebP data URL.

`CardEditorForm.vue` shows friendly inline errors next to each field with `role="alert"`, `aria-invalid` and `aria-describedby`, and all validation messages are rendered in the selected language. The editor validates before saving, previewing or generating a PDF, and the store validates again before writing to IndexedDB.

## JSON backup and import

Because there is no backend, backups are the way to move a collection between browsers or devices. Implemented in `src/services/backup/backupService.ts` and exposed in Settings:

- Export: the backup contains `appId: "card-generator"`, `version: 1`, `exportedAt` and the full card list with images embedded as base64 data URLs, including each card's translations. The default filename is `card-generator-backup-YYYY-MM-DD.json`.
- Import: `parseBackup`/`parseBackupFile` reject malformed JSON, a wrong `appId`, unsupported versions, non-array card lists and invalid cards (bad statistics, unknown zone, missing required fields, malformed or over-long translated text); import errors are shown in the selected language. Backups created before localization have no `translations` field and are imported as English-only cards, which fall back to English when rendered. Valid cards receive an existing id when present or a newly generated one, and are merged into the local collection by id; duplicate ids inside a backup collapse to a single card.

## CSV import

The Cards page has an **Import CSV & Export PDF** button: pick a CSV file, and the application validates every row, creates the cards in the local collection and immediately downloads a PDF with one card per page. The repository includes `sample.csv` with the three demo cards as a starting template, including the sample artwork from `src/assets` (`img1.jpeg`, `img2.jpeg`, `img3.jpeg`).

CSV format (`src/services/csv/csvService.ts`):

- Required columns: `title`, `attack`, `defense`, `action`, `zone`. Optional columns: `subtitle`, `image`, `stars`. Header names are case-insensitive and unknown columns are ignored.
- `zone` accepts `ATTACK`, `MIDFIELD` or `DEFENSE` (case-insensitive). `attack` and `defense` are integers from 0 to 999. `subtitle`, `image` and `stars` may be empty; a missing `stars` value defaults to 1.
- `stars` must be a whole number between 1 and 3.
- `image` may be a base64 data URL (`data:image/png;base64,...`, `image/jpeg` or `image/webp`), the file name of an image bundled in `src/assets` (for example `img1.jpeg`), or the file name of an image uploaded on the **Images** page. Referenced files are loaded and stored in the card as portable data URLs, so they survive backups and PDF export. Data URLs contain commas, so wrap them in double quotes.
- Standard CSV quoting is supported: wrap fields containing commas, quotes or line breaks in double quotes and escape inner quotes by doubling them (`""`). Both comma and semicolon delimiters are detected.
- A UTF-8 BOM and CRLF line endings are accepted; up to 500 data rows are imported per file.
- Import is all-or-nothing: if any row is invalid, nothing is created and the UI lists the offending rows in the selected language (for example `Row 3: Attack must be a number between 0 and 999.` in English).
- Translated text columns: for every non-English language add optional `title_<lang>`, `subtitle_<lang>` and `action_<lang>` columns, for example `title_pt`, `subtitle_pt`, `action_pt`, `title_fr`, `title_de`, `action_it`, and so on for `pt`, `fr`, `es`, `de`, `nl` and `it`. A language is imported when at least one of its three columns has a value; empty columns fall back to the English text. Translation lengths are validated with the same limits as the base fields.
- The bundled `sample.csv` demonstrates the format with the three demo cards fully translated into all seven languages, so a CSV import immediately exports in any language.

## Settings

The Settings page stores preferences in `localStorage` under `card-generator:settings`:

- Physical card width and height in millimetres (default 63 x 88 mm, clamped to 40-110 mm and 56-154 mm). The PDF page size equals these dimensions.
- Image quality for future uploads (0.5-1.0, shown as a percentage).
- Reset settings to defaults, restore the demo cards (existing ids get a fresh copy), export/import a JSON backup and delete all local cards behind a confirmation dialog.

Settings are validated and clamped when read, so corrupted stored values fall back to defaults.

The application language is not one of these settings: it is chosen from the picker in the header and persisted separately under `card-generator:language`, as described in the Languages section.

## Routes

Defined in `src/router/index.ts` with HTML5 history mode and lazily loaded views:

| Route | View | Purpose |
| --- | --- | --- |
| `/` | - | Redirects to `/cards`. |
| `/cards` | `CardListView.vue` | Card collection with create, edit, preview, PDF and delete actions. |
| `/cards/new` | `CardEditorView.vue` | Editor for a new card with live preview. |
| `/cards/:id/edit` | `CardEditorView.vue` | Editor for an existing card. |
| `/cards/:id/preview` | `CardPreviewView.vue` | Large preview with edit and PDF actions. |
| `/images` | `ImageView.vue` | Image library: bundled samples, multi-upload and CSV references. |
| `/settings` | `SettingsView.vue` | PDF settings, backup/import and local data management. |

Unknown paths redirect to `/cards`, and navigation never triggers a full page reload.

## Limitations of a client-only application

- Data is scoped to the browser and origin that created it; opening the app from a different port, host or browser shows a different collection.
- Clearing site data removes all cards permanently.
- There is no cross-device or cross-browser sync. Moving a collection requires exporting a JSON backup and importing it elsewhere.
- Browser storage quotas limit very large collections; the storage layer can fail with a quota error when the limit is reached. Uploaded images and the copies embedded in cards both count toward the quota, so very large image libraries may need pruning on the Images page.
- Because there is no backend, the app must be served as static files (dev server, `npm run preview` or any static host).

## Troubleshooting

- **Storage unavailable message** - IndexedDB is disabled or unavailable, for example in some private browsing modes or when site data is blocked. The UI shows a localized message (English: "Local storage is not available in this browser, so cards cannot be saved.") and cards cannot be loaded or saved until storage is available. The same error appears if the database is blocked by another open tab.
- **Image upload rejected** - the file must be a real PNG, JPEG or WebP of at most 5 MB. Renamed files of other types fail the magic-byte check, and corrupted files fail during decoding/re-encoding.
- **PDF export fails** - check the browser console; corrupt or unsupported image payloads fall back to a placeholder automatically, but extreme custom card dimensions and unavailable storage can still surface a friendly error in the UI.
- **Cards disappeared** - site data was likely cleared, or the app is being opened from a different origin. Restore from a JSON backup or use "Restore Demo Cards" in Settings.
- **Demo cards reappear** - they are seeded only once per browser, when the collection is empty and the seed flag is absent. If the flag cannot be stored (for example, `localStorage` is blocked in private mode), they may be seeded again.
