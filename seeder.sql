INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES
('REG_CODE_ACTIVE', 'false'),
('REG_CODE', 'DEFAULT_REG_CODE'),
('DB_AUTOVACUUM', 'false'),
('USER_SHOPPINGLIST_ACTIVE', 'false');

INSERT OR IGNORE INTO item_categories (uuid, name, is_active) VALUES
('13620506-b9f8-44d7-a9ff-d1b58ddee93f', 'System', 2); -- 2 To Hide it

INSERT OR IGNORE INTO items (uuid, name, stock, target_stock, price, pack_size, pack_price, category_id, is_active) VALUES
('13620506-b9f8-44d7-a9ff-d1b58ddee93f', 'Transaction', 1, 1, 1.00, 1, 1.00, 1, 2),  -- 2 To Hide it
('80a38ccf-013f-404f-9099-b2a63e958aa8', 'Purchase', 1, 1, 1.00, 1, 1.00, 1, 2);  -- 2 To Hide it