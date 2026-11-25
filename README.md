<p align="center">
  <img src="src/media/images/core/wikicambada-core-readme.png" alt="WikiCambada Core" width="960" />
</p>

<p align="center">
  <strong>English</strong> | <a href="readmes/README.pt-BR.md">Português (Brasil)</a>
</p>

# WikiCambada Core

**WikiCambada Core** is a serverless wiki engine designed for the Cloudflare ecosystem. It combines a static web application with Pages Functions, D1, R2 and Cloudflare Access to provide Markdown articles, revisions, administration, media, search, categories, templates and collaboration without maintaining a traditional server.

## Contents

- [Use cases](#use-cases)
- [How it works](#how-it-works)
- [What it is](#what-it-is)
- [What it is not](#what-it-is-not)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Graphical setup](#graphical-setup)
- [Configuration and presets](#configuration-and-presets)
- [Cloudflare](#cloudflare)
- [Updates](#updates)
- [Migrating from 1.0.13](#migrating-from-1013)
- [Recovery](#recovery)
- [Global settings](#global-settings)
- [Special pages](#special-pages)
- [Project structure](#project-structure)
- [Security](#security)
- [Development](#development)
- [Credits](#credits)
- [License and copyright](#license-and-copyright)

## Use cases

WikiCambada Core can be used as a foundation for:

- community wikis
- software and API documentation
- independent encyclopedias
- private knowledge bases
- internal documentation protected by Cloudflare Access
- editorial projects with revision history, review and media

Each installation maintains its own data, configuration, visual identity, D1 database and R2 bucket.

## How it works

The frontend is served by Cloudflare Pages. Dynamic routes and APIs run on Pages Functions. Editorial content is stored in D1, while images, videos and audio are stored in R2. Cloudflare Access authenticates editors, moderators and administrators; the Core manages internal roles and editorial permissions.

```text
browser
   │
   ├── Cloudflare Pages ── frontend, styles and public configuration
   │
   ├── Pages Functions ── APIs, routes, validation and administration
   │       ├── D1 ── pages, revisions, users, proposals and metadata
   │       └── R2 ── images, videos and audio
   │
   └── Cloudflare Access ── editor authentication
```

## What it is

- a wiki engine designed for Cloudflare
- a serverless application without its own persistent server
- a Markdown editor with wiki features
- a deployable and configurable foundation
- a project that can be updated without overwriting an installation's identity
- free software distributed under the GNU AGPL v3

## What it is not

- a fork of MediaWiki
- a PHP application or a project that requires a LAMP server
- an attempt to reproduce full compatibility with MediaWiki extensions, skins and wikitext
- a general-purpose CMS for every type of website
- a way to turn D1 into large-file storage
- an automatic replacement for Cloudflare account policies, backups and controls

## Features

### Content and editing

- Markdown articles
- revisions with mandatory edit summaries
- revision history and comparison
- revision restoration
- edit conflict detection
- local browser drafts
- aliases and redirects with section fragments
- talk pages and user pages
- public edit proposals

### Organization

- categories
- ranked search and autocomplete
- wiki-style internal links
- manual table of contents with `__TOC__`
- breadcrumbs
- recent pages, all pages and a random page
- `Especial` namespace for Core-generated features

### Markdown and media

- infoboxes
- configurable editorial templates
- notice boxes and `:::` components
- tables, lists, blockquotes and code blocks
- image, video and audio uploads
- R2 storage
- file pages
- media gallery and viewer

### Administration

- `editor`, `moderator`, `admin` and `super_admin` roles
- administration panel organized into sections
- page locking, renaming and soft deletion
- trash with restoration and permanent deletion
- media and storage management
- IP and CIDR rules
- recent activity
- content export and JSON seed import
- full D1/R2 backup and resumable restoration
- template management
- global feature settings

### Appearance

- automatic, white, black and OLED themes
- text size
- MacType or classic font rendering
- per-installation name, tagline, logos, favicon, colors and fonts
- configurable navigation and external links

## Architecture

The Core separates three kinds of state:

1. **Core code**: functions, renderers, routes, styles and migrations
2. **Installation configuration**: identity, branding, features, navigation, access and Cloudflare
3. **Wiki data**: pages, revisions, users, proposals, templates and media

The main installation files are:

```text
/src/config/site.json
/src/config/installation.json
/.wikicambada/state.json
```

`site.json` defines the wiki. The checkout and the ZIP start with the same generic configuration, without D1 IDs, Access credentials or an installation-specific identity. `installation.json` records the version and required schema of the distribution. The applied schema remains unknown until verified against the database. The `.wikicambada/` directory stores local state, build files and backups and is excluded from Git.

## Requirements

### Local system requirements

These requirements apply to local installation, configuration, updates, development, builds and deployment, not to visitors of a published wiki.

| Component | Minimum | Recommended |
| --- | --- | --- |
| Windows | Windows 11 (Windows NT 10.0.22000) | Windows 11 25H2 (Windows NT 10.0.26200) or later |
| macOS | macOS 13.5 (Darwin 22.6.0) | macOS 13.5 or later |
| Linux | Distribution with glibc 2.35 or later | Distribution with glibc 2.35 or later |
| Processor | 64-bit x86-64 or ARM64, single-core, 1 GHz or faster; SSE4.2 and CLMUL (x86-64) or CRC (ARM64) | 64-bit x86-64 or ARM64, dual-core, 1 GHz or faster; SSE4.2 and CLMUL (x86-64) or CRC (ARM64) |
| Available RAM | 512 MB | 2 GB |
| Available storage | 1 GB | 4 GB |
| Display resolution | 1024 × 768 | 1280 × 720 |
| Node.js | v22.13.0 or later | v24 LTS or a later compatible LTS release |
| Cloudflare Wrangler | v4 | Version supplied by the Core's lockfile |

The operating system and CPU instruction requirements follow [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and [workerd](https://github.com/cloudflare/workerd#supported-platforms). Use an operating system that still receives security updates; the Windows 11 21H2 minimum is a compatibility baseline, not a recommendation to use an unsupported release. Use a supported [Node.js release](https://nodejs.org/en/about/previous-releases/).

Hardware figures are estimates, not tested minimums. Larger wikis, local backups, builds and dependency installation may require additional memory or storage. Display requirements apply only to the graphical setup. Internet access is required for online operations.

### Cloudflare requirements

- Cloudflare account
- Cloudflare Pages
- D1 database
- R2 bucket for media
- Cloudflare Access for authenticated editing

## Quick start

Download the distribution ZIP from [Releases](https://github.com/masondoceu/wikicambada-core/releases), extract it into a new directory, enter the project root and run:

```bash
node setup.js
```

On Windows, double-click `setup.cmd`. On Linux/Unix, run `./setup.sh`; on macOS, open `setup.command`. The launchers use the same `setup.js` regardless of the current working directory. The setup bundles its own libraries and does not require `npm install` to open.

The setup opens a local interface on `127.0.0.1`. The **Close** button shuts down the server; closing the last tab also shuts it down after 25 seconds, allowing critical operations to finish. If the browser does not open, visit the URL displayed in the terminal. Use `node setup.js --no-browser` to open it manually. The setup does not expose an installation route on the published wiki.

New installations receive a main page and an introductory guide in the selected language, created as ordinary pages and revisions on the first request after migrations have been applied. The seed is idempotent: it does not overwrite wikis containing pages or recreate deleted content. Reconfiguring an existing installation does not activate the seed.

After configuration:

```bash
npm ci
npm run db:migrations:apply:remote
npm run deploy
```

Before the first deployment, configure the following in `wrangler.toml`:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `database_id`
- `preview_database_id`

Secrets, such as a Discord webhook, must be configured through Wrangler or the Cloudflare dashboard, not stored in `site.json`.

## Graphical setup

The setup has five main modes:

- **Create a new wiki**, starting from a generic configuration
- **Reconfigure this wiki**, preserving the existing installation
- **Update WikiCambada Core** using a ZIP package
- **Verify the installation**
- **Migrate a legacy wiki** to a new directory

The setup interface supports:

- `pt-BR — Português (Brasil)`
- `en — English`

The setup language and wiki language are independent choices. The setup, main navigation, static error pages and Core-generated public pages have Brazilian Portuguese and English text. Editorial content is still defined by each installation.

## Configuration and presets

Presets are starting points, not separate code distributions:

- software documentation
- community wiki
- encyclopedia
- private knowledge base
- minimal installation
- custom

A preset applies initial features. Administrators can then adjust global options without reinstalling the Core. The setup also edits links in the main, community and external navigation areas using lines in the `Name | URL` format.

## Cloudflare

The `wrangler.toml` file contains the installation's bindings and public variables. The setup preserves existing IDs when reconfiguring a project.

Expected bindings:

```toml
[[d1_databases]]
binding = "DB"

[[r2_buckets]]
binding = "WIKI_BUCKET"
```

Relevant variables:

```toml
WIKI_SITE_NAME = "My Wiki"
WIKI_SUPER_ADMIN_EMAIL = "admin@example.com"
WIKI_CORE_VERSION = "v1.1.0-r2"
PUBLIC_BASE_URL = "https://wiki.example.com"
```

## Updates

Updates are managed through the setup, but use a separate module. This allows the same engine to be reused in graphical mode, on the command line and in future automation.

In v1.1.0-r2, the setup accepts a local distribution ZIP and:

1. validates the release manifest structure and hashes
2. detects locally modified Core files
3. creates a backup in `.wikicambada/backups/`
4. applies Core files
5. preserves configuration, branding, fonts, referenced local assets, `.dev.vars` and `wrangler.toml`
6. preserves installation-specific commands in `package.json`
7. records the schema required by the distribution and verifies the project
8. automatically restores the backup if the local update fails

The package is rejected if it contains unsafe paths, files not registered in the manifest, mismatched hashes, special file types, extracted content exceeding the limit or a base version older than the current installation.

D1 migrations remain an explicit step. Rolling back files does not automatically roll back the database.

Custom files referenced by the installation are preserved even when the ZIP contains the same path. Additional installation files are not removed. Conflicts with Core files are detected before application. `1.1.0-r1`, `1.1.0-r2`, beta and stable versions have their own ordering; downgrades are rejected.

Local operations use mutual exclusion and a recovery journal. After an interruption, run `node setup.js recover-local` before configuring or updating again. Recovery saves the current state before restoring the previous backup.

If the Windows setup reports a conflict with `README.md` when updating from an older package, extract the new ZIP to a separate folder. Run this command from that folder, using the installed wiki's path, the original ZIP path and its SHA-256 from a trusted source:

```sh
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { Project } from './src/setup/project.js'; import { updateFromBase64 } from './src/setup/updater.js'; const [wiki, zip, sha] = process.argv.slice(1); await updateFromBase64(new Project(wiki), readFileSync(zip, 'base64'), zip, sha)" -- "path/to/installed-wiki" "path/to/core.zip" "SHA-256"
```

To generate a generic distribution, run `node setup.js package --output wikicambada-core-1.1.0-r2.zip`. The destination must not already exist. The package includes only the Core, generic configuration, migrations, tests, documentation and license; it does not include installation-specific bindings, branding or local state. Verification uses the same mechanism as the updater. Unix launchers receive executable permissions in the ZIP. The TOML and ZIP libraries are bundled in `src/setup/vendor.cjs`; when changing them, regenerate the bundle with `node src/scripts/build-setup-vendor.mjs`.

Manifest hashes verify integrity but do not authenticate the author. The local update API accepts `expectedSha256` to verify a ZIP hash obtained through a trusted channel. The project does not yet provide a release-signing infrastructure.

The updater requires a distribution with manifests. Use **Migrate a legacy wiki** when the source is a pre-manifest `1.0.13` installation.

## Migrating from 1.0.13

In the setup, specify a source directory or select a ZIP of the installation. Use a new destination directory whose parent already exists. From the command line:

```bash
node setup.js migrate-legacy --source /path/to/source --output /path/to/migrated-wiki
```

Migration identifies the version using the package, frontend, Wrangler configuration and inventory of 14 migrations. The legacy variant of migration 0009 is accepted by its known hash. The difference is the initial text of a template, which remains in the existing database. The Core uses its own scripts and lockfile, converts identity and navigation, and retains references to D1, R2 and Access. Legacy code and original configuration are stored in `.wikicambada/backups/legacy-1.0.13`. Review the files reported by the setup, including modified code and files retained only in the backup. Wrangler configurations with environments or custom builds require review before migration.

The destination becomes available after the Core and public build have been validated. A failure before that stage allows the operation to be retried. After forced process termination, a temporary `legacy-migration-*` directory may remain under `.wikicambada` in the parent directory. It can be removed with the setup closed. Protect that directory and the backup, which may contain private configuration. Existing local state under `.wrangler/state` is retained in the backup for deliberate reuse with a compatible runtime.

The setup records the destination schema as unverified. Before deploying, create a full D1 and R2 backup and validate the migration using private copies. Confirm that the database has the 1.0.13 schema and migrations 0001–0014 recorded in `d1_migrations`. Once confirmed, Wrangler applies 0015–0017 during the explicit database update step. Investigate any discrepancies in the schema or migration records before running Wrangler. Verify reading, editing, permissions, history, files and integrations in the staging installation. Write clients must use the current base-revision, origin-protection and authenticated-upload contracts.

## Recovery

The JSON export at `/admin/backup` remains a content and seed tool. It does not restore an installation or replace a full backup.

The recovery format uses a directory containing `database.sqlite`, individual objects in `objects/`, an `objects.jsonl` inventory and a SHA-256 manifest. The database preserves full history, users and their states, proposals, IP rules, templates, global settings and media metadata. R2 objects retain their contents and HTTP/custom metadata.

The remote client requires a valid Cloudflare Access JWT belonging to the configured super administrator. The token file must contain only the JWT. These commands are examples for an installation controlled by the operator:

```bash
node setup.js backup --url https://wiki.example.com --token-file access.jwt --output backup-wiki
node setup.js restore --url https://destination.example.com --token-file access.jwt --archive backup-wiki
```

The backup also copies the installation's configuration and local assets. `--configuration` allows a different configuration directory to be specified. These files are stored in `configuration/` within the recovery archive; applying them to the destination checkout is a local step that retains appropriate bindings and secrets for the destination. The API does not alter Cloudflare infrastructure or Access policies.

The operation temporarily closes the wiki and blocks database writes. Restoration requires an empty destination with this version's migrations applied and validates the entire archive before starting. Transfers use chunks and separate objects rather than placing the entire wiki in a single JSON file. The destination is opened only after counts, references and media have been verified.

If restoration is interrupted, retain the local state file and run the same command with `--resume`. The wiki remains closed while restoration is incomplete. `node setup.js abort-recovery --url https://destination.example.com --token-file access.jwt` removes data transferred by the operation and unlocks the destination. The lock does not expire automatically. If a connection drops during finalization, check the API state before deleting the local file; the absence of a lock alone does not prove that restoration succeeded.

For SQLite databases and objects already available locally:

```bash
node setup.js backup-local --database source.sqlite --objects objects --configuration configuration --output backup-local
node setup.js restore-local --archive backup-local --output new-destination
```

Local restoration prepares and verifies a temporary directory before publishing it as the destination. Missing files, mismatched hashes, incompatible schemas and existing destinations are rejected. Object keys must be representable on the recovery archive's filesystem; reserved names and case collisions are rejected. The format still needs to be tested against the actual object keys of the `1.0.13` installation.

The backup contains private data and may contain local secrets. Store it with the same access restrictions as the installation.

## Global settings

Administrators and the super administrator can open:

```text
/admin/settings
```

Options are stored in D1 and control features for all users, including:

- special pages
- search
- talk pages
- user pages
- public edit proposals
- history
- uploads
- templates
- categories
- random page
- Powered by WikiCambada Core badge
- recent activity

The required migration is:

```text
src/data/migrations/0015_v1_1_0_global_settings.sql
```

## Special pages

The canonical namespace is:

```text
/wiki/especial
```

Initial pages:

```text
/wiki/especial/todas-as-paginas
/wiki/especial/paginas-recentes
/wiki/especial/categorias
/wiki/especial/pagina-aleatoria
/wiki/especial/versao
```

Legacy aliases and English equivalents are still accepted. Special pages generated by the Core cannot be edited, receive edit proposals or have ordinary editorial history.

## Project structure

```text
/
├── README.md
├── readmes/
│   └── README.pt-BR.md
├── setup.js
├── setup.cmd
├── setup.sh
├── setup.command
├── index.html
├── package.json
├── wrangler.toml
├── functions/
├── src/
│   ├── config/
│   ├── data/
│   ├── media/
│   ├── scripts/
│   ├── setup/
│   └── styles/
└── .wikicambada/
```

Entrypoints are in the root directory. Code and assets are in `/src/`. Data and migrations are in `/src/data/`. Pages Functions remain in `/functions/` as required by the platform.

## Security

- keep `ACCESS_STRICT = "true"` in production and configure the Access issuer and audience
- protect `/edit/*`, `/admin/*` and `/api/secure/*` with Cloudflare Access
- do not store secrets in public files
- back up D1 before destructive migrations
- review IP rules and role permissions
- keep the Core and Wrangler up to date
- review local changes before replacing Core files

`access.mode` generates `WIKI_ACCESS_MODE`: `public` and `cloudflare-access` retain public reading and authenticated editing; `private` requires a verified identity and an active profile for reading as well. For a private wiki, protect the entire host with Cloudflare Access. Existing public reading modes remain subject to the Core's internal permissions for editing and administration.

To administer a local installation without Cloudflare Access, set `DEV_BYPASS_AUTH=true` in `.dev.vars` and start it with `npm run dev`. The development server listens only on loopback and provides a local super administrator identity through a temporary server-generated proof. The flag alone, identity headers and execution on a public address do not enable the bypass. Do not deploy the development configuration. The legacy `WIKI_DEV_AUTH` mode still requires `ACCESS_STRICT="false"` and loopback.

API write operations require `X-Wiki-Request: 1`; different origins and `Sec-Fetch-Site: cross-site` are rejected. Revisions, revision restorations and proposal approvals require `expectedRevisionId` (`null` only for a new page). Omission returns HTTP 428; a stale base returns 409. Conflict resolution preserves local content until the editor makes a decision.

Pages deploys only `.wikicambada/public`, prepared by `npm run build`. Development and deployment scripts run this preparation step. The builder copies an explicit list of public HTML, JS, CSS and data files, along with allowed media and font formats. `.dev.vars`, state, backups, the installer, migrations, ZIPs and private configuration are excluded from public assets. Pages Functions remain in `/functions/`.

## Development

In a fresh clone, `node setup.js verify` checks Core files and the local configuration structure. To install the lockfile dependencies, run `npm ci`. Use a separate copy to test wiki configuration, since the setup writes `site.json`, `installation.json` and `wrangler.toml` in the directory where it is installed.

Local Pages server:

```bash
npm run dev
```

Project verification:

```bash
node setup.js verify
```

Local tests, type checking and build:

```bash
npm test
npm run typecheck
npm run build
```

Tests use SQLite, local Miniflare D1/R2 and temporary fixtures. They cover the compiled Pages worker, migrations through local Wrangler, interrupted writes, concurrency, resumable HTTP recovery, ZIP updates and asset selection. They do not access production Cloudflare resources. The health check distinguishes the required schema from migration records actually found in the database.

Migrations are located in `src/data/migrations/`. Version history is available in [CHANGELOG.MD](CHANGELOG.MD).

## Credits

WikiCambada Core was created and is maintained by **masondoceu**. The project originated as the technical foundation of WikiCambada and evolved into an engine that can be deployed for other wikis.

The setup experience draws inspiration from the MediaWiki installer for its workflow and separation of steps, without reusing its PHP code or presenting itself as an implementation of MediaWiki.

The official WikiCambada Core icon is the **Cat Guard**. Meow.

## License and copyright

The code is distributed under the **GNU Affero General Public License, version 3**. See [LICENSE](LICENSE) for the full terms.

Among other conditions, the AGPL requires that users interacting over a network with a modified version be able to obtain the corresponding source code of that version.

The code license does not automatically transfer rights to names, logos, images, articles, uploads or other content belonging to individual installations. Operators must separately verify the permissions for the assets and content they use.

Copyright © 2026 masondoceu and WikiCambada Core contributors.
