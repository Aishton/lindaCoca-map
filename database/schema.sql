PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    place_type TEXT NOT NULL CHECK (place_type IN ('canteen', 'shop', 'food_court', 'stall')),
    source_group TEXT NOT NULL CHECK (source_group IN ('食堂', '校内')),
    parent_id TEXT REFERENCES places(id),
    campus_area TEXT CHECK (campus_area IN ('east', 'central', 'west')),
    location_note TEXT,
    source_label TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT '待确认'
        CHECK (verification_status IN ('待确认', '已核实')),
    last_confirmed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS places_name_within_parent
    ON places (COALESCE(parent_id, ''), name);
CREATE INDEX IF NOT EXISTS places_parent_id ON places (parent_id);
CREATE INDEX IF NOT EXISTS places_type ON places (place_type);

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    floor INTEGER CHECK (floor IS NULL OR floor BETWEEN 1 AND 99),
    note TEXT,
    price_level TEXT CHECK (price_level IN ('low', 'mid', 'high')),
    meal_period TEXT CHECK (meal_period IN ('lunch', 'dinner', 'all_day')),
    source_label TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT '待确认'
        CHECK (verification_status IN ('待确认', '已核实')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS recommendations_place_id ON recommendations (place_id);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT REFERENCES places(id),
    proposed_place_name TEXT,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        '还在这里', '位置有误', '楼层入口错误', '菜单或营业信息错误',
        '暂停营业', '新增位置', '其他'
    )),
    details TEXT NOT NULL CHECK (length(trim(details)) > 0),
    review_status TEXT NOT NULL DEFAULT '待审核'
        CHECK (review_status IN ('待审核', '已批准', '已驳回')),
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    CHECK (place_id IS NOT NULL OR proposed_place_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS feedback_review_status ON feedback (review_status);
