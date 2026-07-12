-- Straight-line depreciation input. Nullable: assets without a useful life
-- are treated as non-depreciating (book value = acquisition_cost as-is).
ALTER TABLE assets ADD COLUMN useful_life_years TINYINT UNSIGNED NULL;
