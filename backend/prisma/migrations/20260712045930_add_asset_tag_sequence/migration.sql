-- Atomic counter backing human-readable asset tags (AF-0001, AF-0002, ...)
CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START WITH 1 INCREMENT BY 1;