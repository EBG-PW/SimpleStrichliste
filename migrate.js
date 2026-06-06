const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = './storage/application.db';
const MIGRATIONS_DIR = 'migrations';
const SEEDER_FILE = 'seeder.sql';
const FEATURE_CONFIG_DIR = path.join('config', 'features');
const { installFeatures } = require('./lib/features');
let featuresInstalled = false;

if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    console.log(`Created database directory: '${path.dirname(DB_PATH)}'`);
}

function installCurrentFeatures() {
    if (featuresInstalled) return;
    installFeatures();
    featuresInstalled = true;
}

function execSqlFile(db, filePath, label) {
    console.log(`Applying SQL from ${label}: ${filePath}...`);
    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        db.exec(sql);
        console.log(`Successfully applied ${label}.`);
    } catch (err) {
        console.error(`FAILED to apply ${label} '${filePath}'.`);
        throw err;
    }
}

const loadInstalledFeatureConfigs = () => {
    if (!fs.existsSync(FEATURE_CONFIG_DIR)) return [];

    return fs.readdirSync(FEATURE_CONFIG_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => {
            const configPath = path.join(FEATURE_CONFIG_DIR, file);
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return {
                name: config.name || path.basename(file, '.json'),
                config,
            };
        });
};

const getFeatureSqlFiles = (feature, type) => {
    const configuredFiles = Array.isArray(feature.config?.db?.[type]) ? feature.config.db[type] : [];
    const cwd = process.cwd();

    return configuredFiles
        .map(file => path.normalize(file))
        .filter(file => {
            const resolvedPath = path.normalize(path.join(cwd, file));
            const relativePath = path.relative(cwd, resolvedPath);
            return !relativePath.startsWith('..') && !path.isAbsolute(relativePath) && fs.existsSync(resolvedPath) && file.endsWith('.sql');
        })
        .sort();
};

/**
 * Applies data from the seeder files.
 * @param {Database.Database} db The database instance.
 */
function applySeeder(db) {
    installCurrentFeatures();

    if (fs.existsSync(SEEDER_FILE)) {
        execSqlFile(db, SEEDER_FILE, 'base seeder');
    } else {
        console.log(`Seeder file '${SEEDER_FILE}' not found, skipping.`);
    }

    loadInstalledFeatureConfigs().forEach(feature => {
        getFeatureSqlFiles(feature, 'seeds').forEach(seedFile => {
            execSqlFile(db, seedFile, `feature seeder ${feature.name}`);
        });
    });
}

function applyMigrations() {
    console.log('Starting database migration process...');
    installCurrentFeatures();

    const db = new Database(DB_PATH, {
        // verbose: console.log
    });

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);
        console.log(`Make sure 'schema_migrations' table exists.`);
    } catch (err) {
        console.error(`Failed to create migrations table: ${err.message}`);
        db.close();
        process.exit(1);
    }

    const getAppliedStmt = db.prepare(`SELECT version FROM schema_migrations`);
    const appliedRows = getAppliedStmt.all();
    const appliedVersions = new Set(appliedRows.map(row => row.version));
    console.log(`Found ${appliedVersions.size} applied migrations.`);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log(`Migrations directory '${MIGRATIONS_DIR}' not found. Nothing to do.`);
    }

    const baseMigrationFiles = fs.existsSync(MIGRATIONS_DIR)
        ? fs.readdirSync(MIGRATIONS_DIR)
            .filter(file => file.endsWith('.sql'))
            .sort()
            .map(file => ({
                displayName: file,
                filePath: path.join(MIGRATIONS_DIR, file),
                version: file.split('-')[0],
            }))
        : [];

    const featureMigrationFiles = loadInstalledFeatureConfigs().flatMap(feature => {
        return getFeatureSqlFiles(feature, 'migrations').map(file => {
            const filename = path.basename(file);
            return {
                displayName: `${feature.name}/${filename}`,
                filePath: file,
                version: `feature:${feature.name}:${filename.split('-')[0]}`,
            };
        });
    });

    const pendingMigrations = [...baseMigrationFiles, ...featureMigrationFiles]
        .filter(migration => !appliedVersions.has(migration.version));

    if (pendingMigrations.length === 0) {
        console.log('Database schema is up to date. No new migrations to apply.');
    } else {
        console.log(`Found ${pendingMigrations.length} pending migrations to apply.`);

        for (const migration of pendingMigrations) {
            const applyMigrationTx = db.transaction(() => {
                try {
                    const sql = fs.readFileSync(migration.filePath, 'utf8');

                    db.exec(sql);

                    const recordMigrationStmt = db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`);
                    recordMigrationStmt.run(migration.version);

                    console.log(`Successfully applied migration: ${migration.displayName}`);
                } catch (err) {
                    console.error(`FAILED to apply migration ${migration.displayName}. Rolling back.`);
                    throw err;
                }
            });

            try {
                applyMigrationTx();
            } catch (err) {
                console.error(`Migration failed: ${err.message}`);
                db.close();
                process.exit(1);
            }
        }
    }

    try {
        applySeeder(db);
    } catch (err) {
        console.error(`Seeding failed: ${err.message}`);
        db.close();
        process.exit(1);
    }

    console.log('Migration and seeding process finished successfully.');
    db.close();
}

/**
 * Creates a new, empty .sql file in the migrations directory.
 * @param {string} name
 */
function createMigration(name) {
    if (!name) {
        console.error('Migration name is required. Usage: node migrate.js create <MigrationName>');
        process.exit(1);
    }

    const sanitizedName = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `${timestamp}-${sanitizedName}.sql`;
    const filepath = path.join(MIGRATIONS_DIR, filename);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        fs.mkdirSync(MIGRATIONS_DIR);
        console.log(`Created migrations directory: '${MIGRATIONS_DIR}'`);
    }

    fs.writeFileSync(filepath, `-- Add your SQL migration statements here for ${filename}\n`);

    console.log(`Created new migration file: ${filepath}`);
}

function main() {
    const command = process.argv[2];
    const argument = process.argv[3];

    switch (command) {
        case 'apply':
            applyMigrations();
            break;
        case 'create':
            createMigration(argument);
            break;
        case 'seed':
            applySeeder(new Database(DB_PATH));
            break;
        case 'setup':
            applyMigrations();
            break;
        default:
            console.log('Usage:');
            console.log('  node migrate.js <command> [args]');
            console.log('  node migrate.js seed            - Applies data from the seeder files.');
            console.log('  node migrate.js apply           - Applies pending migrations and seeds data.');
            console.log('  node migrate.js create <Name>   - Creates a new, empty migration file.');
            process.exit(1);
    }
}

main();
