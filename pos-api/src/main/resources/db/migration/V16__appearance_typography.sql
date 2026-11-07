-- FR-SET-03 extension: persisted, allowlisted typography controls.
-- The keys are mapped to fixed CSS font stacks by the frontend; no arbitrary
-- font-family value crosses the API boundary.
ALTER TABLE business_settings
    ADD COLUMN font_family varchar(20) NOT NULL DEFAULT 'JAKARTA'
        CHECK (font_family IN ('JAKARTA', 'SYSTEM', 'ARIAL', 'VERDANA', 'GEORGIA')),
    ADD COLUMN font_scale_percent integer NOT NULL DEFAULT 100
        CHECK (font_scale_percent BETWEEN 90 AND 130);
