const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = './storage/application.db';
const MIGRATIONS_DIR = 'migrations';
const SEEDER_FILE = 'seeder.sql';

/**
 * Applies data from the seeder file.
 * @param {Database.Database} db The database instance.
 */
function applySeeder(db) {
    if (!fs.existsSync(SEEDER_FILE)) {
        console.log(`Seeder file '${SEEDER_FILE}' not found, skipping.`);
        return;
    }

    console.log(`Applying data from seeder file: ${SEEDER_FILE}...`);
    try {
        const sql = fs.readFileSync(SEEDER_FILE, 'utf8');
        db.exec(sql);
        console.log(`✅ Successfully applied seeder data.`);
    } catch (err) {
        console.error(`❌ FAILED to apply seeder file '${SEEDER_FILE}'.`);
        throw err;
    }
}


function applyMigrations() {
    console.log('Starting database migration process...');

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


    const allMigrationFiles = fs.existsSync(MIGRATIONS_DIR)
        ? fs.readdirSync(MIGRATIONS_DIR)
            .filter(file => file.endsWith('.sql'))
            .sort()
        : [];

    const pendingMigrations = allMigrationFiles.filter(file => {
        const version = file.split('-')[0];
        return !appliedVersions.has(version);
    });

    if (pendingMigrations.length === 0) {
        console.log('Database schema is up to date. No new migrations to apply.');
    } else {
        console.log(`Found ${pendingMigrations.length} pending migrations to apply.`);

        for (const migrationFile of pendingMigrations) {
            const applyMigrationTx = db.transaction(() => {
                try {
                    const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
                    const sql = fs.readFileSync(migrationPath, 'utf8');

                    db.exec(sql);

                    const version = migrationFile.split('-')[0];
                    const recordMigrationStmt = db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`);
                    recordMigrationStmt.run(version);

                    console.log(`✅ Successfully applied migration: ${migrationFile}`);
                } catch (err) {
                    console.error(`❌ FAILED to apply migration ${migrationFile}. Rolling back.`);
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
 * Creates a new, empty .sql file in the
 * @param {string} name
 */
function createMigration(name) {
    if (!name) {
        console.error('❌ Migration name is required. Usage: node migrate.js create <MigrationName>');
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

    console.log(`✅ Created new migration file: ${filepath}`);
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
            applySeeder(new Database(DB_PATH));
            break;
        default:
            console.log('Usage:');
            console.log('  node migrate.js <command> [args]');
            console.log('  node migrate.js seed            - Applies data from the seeder file.');
            console.log('  node migrate.js apply           - Applies pending migrations and seeds data.');
            console.log('  node migrate.js create <Name>   - Creates a new, empty migration file.');
            process.exit(1);
    }
}

main();