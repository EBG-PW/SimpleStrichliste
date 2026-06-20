# SimpleStrichliste

SimpleStrichliste is a small self-hosted balance and store application with the support for optional features that add more functionality.

## Setup With Docker

The easiest way to run the application is Docker Compose:

```bash
docker compose up -d
```

The default `docker-compose.yml` starts the app on:

```text
http://localhost:3000
```

Persistent data is stored in mounted folders:

```text
./storage:/app/storage
./installed_features:/app/installed_features
```

`storage` contains the SQLite database, uploaded images, generated assets, and backups. Keep this folder when updating or recreating the container.

For local development with a locally built image, use:

```bash
docker compose -f docker-compose.dev.wsl.yml up -d --build
```

On first startup the app creates/migrates the database automatically. If no users exist, the setup page lets you create the first user. The first user is created as an administrator by default. When OAuth is enabled, the first successful OAuth login also creates the first local user as an administrator.

## Configuration

Most runtime configuration is done through environment variables in Docker Compose or `.env`.

Common settings:

```env
APPLICATION=Strichliste
DOMAIN=http://localhost:3000
FALLBACKLANG=de
PORT=3000
BINDIP=0.0.0.0
SALTROUNDS=12
WebTokenDurationH=9600
```

`DOMAIN` must match the public URL users open in their browser. This matters for generated links, static assets, manifests, and OAuth callbacks.

Email notifications use an SQLite-backed queue. Configure an SMTP server with:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@example.com
SMTP_PASSWORD=change-me
SMTP_FROM=notifications@example.com
EMAIL_MAX_RETRIES=5
```

`SMTP_SECURE=true` enables implicit TLS. Port `465` also enables it automatically. Failed sends are retried by the notification worker until `EMAIL_MAX_RETRIES` is reached.

Email HTML templates live in `config/templates/email/*.ejs`. Their i18next translations live in `config/templates/email/locales/<language>.json`; the recipient's saved language is used with `FALLBACKLANG` as fallback.

## OAuth Login

When `EBG_OAUTH_URL` is set, local password login and local registration are replaced by OAuth. In this mode:

- `/login` and `/register` show OAuth buttons instead of local forms.
- Local password login and local registration API calls are rejected.
- The registration-code settings are hidden because registration is managed by the OAuth provider.
- Users cannot change their local password in user settings, because OAuth users do not log in with that password.
- The first OAuth-created local user becomes admin automatically.

Required OAuth environment variables:

```env
EBG_OAUTH_URL=https://ebg.pw
EBG_OAUTH_CLIENT_ID=your-client-id
EBG_OAUTH_CLIENT_SECRET=your-client-secret
EBG_OAUTH_SCOPE=your-scope
```

Default OAuth endpoints derived from `EBG_OAUTH_URL`:

```text
Authorize user:  /auth/oauth
Exchange code:   /oauth/authorize
Load user data:  /oauth/user
Callback URL:    <DOMAIN>/auth/oauth/callback
```

## Backups And Import

Backups can be managed from the admin settings page.

Creating a backup stores a zip file in:

```text
storage/backups
```

Each backup contains:

- `application.db`, the SQLite database
- item images from storage
- static stored images such as favicons or warning images

Admins can create, list, download, and delete backups from the admin settings page.

### Import / Restore

Backup import is available only while the application has zero users. This is intentional so a restore cannot overwrite an active installation from inside a logged-in session.

To restore:

1. Start the app with an empty database or no users.
2. Open the setup page.
3. Upload a backup `.zip`.
4. The app restores `application.db` and stored images.
5. The app exits after restore so it can restart cleanly with the restored database.

With Docker Compose, the container uses `restart: unless-stopped`, so it should start again automatically after restore. If it does not, run:

```bash
docker compose up -d
```

## Optional Features

Optional features are installed from independent folders in `installed_features`.
Each feature folder needs a `feature.json` or `config.json` manifest:

```json
{
  "name": "foodorders",
  "version": "0.0.1",
  "enabledByDefault": false,
  "navbar": {
    "insert": true,
    "href": "/foodorders",
    "translationKey": "Navbar.FoodOrders",
    "order": 60
  },
  "adminCard": {
    "href": "/admin/foodorders",
    "translationKeyBase": "Admin.FeatureCards.foodorders"
  },
  "settings": {
    "translationKeyBase": "AdminSettings.Features.foodorders"
  },
  "db": {
    "migrations": [],
    "seeds": []
  }
}
```

On startup the app scans `installed_features/<featureName>`. If the feature version is newer than `config/features/<featureName>.json`, or if the installed config does not exist yet, the feature files are copied into the application.

Supported feature folders include application folders such as `api`, `lib`, `src`, `views`, `public`, and `config`. Feature translations live in:

```text
installed_features/<featureName>/local/<language>/<featureName>.json
```

and are installed to:

```text
config/features/local/<language>/<featureName>.json
```

Feature public files can also be served from:

```text
/features/<featureName>/<file>
```

which maps to:

```text
installed_features/<featureName>/public/<file>
```

### Database Changes

Feature migrations can be placed in:

```text
installed_features/<featureName>/migrations
```

Feature seed files can be placed in:

```text
installed_features/<featureName>/seeds
```

During install they are copied to `migrations/features/<featureName>` and `seeds/features/<featureName>`. Feature migration records are stored as `feature:<featureName>:<migrationVersion>` so their versions do not collide with base app migrations.

Feature migrations should NEVER touch the base application DB structure. They may create, update, or seed feature-owned tables and indexes only.

### Uninstalling

Run:

```bash
node tools/uninstallFeature.js <featureName>
```

This removes files recorded in `config/features/<featureName>.json`. It does not roll back database migrations. To also remove the source folder in `installed_features`, add `--remove-source`.
