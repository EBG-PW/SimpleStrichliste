# SimpleStrichliste

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
