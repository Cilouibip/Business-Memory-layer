ALTER TABLE content_items ADD CONSTRAINT content_items_raw_document_id_unique UNIQUE (raw_document_id);
ALTER TABLE offers ADD CONSTRAINT offers_raw_document_id_unique UNIQUE (raw_document_id);
ALTER TABLE entities ADD CONSTRAINT entities_raw_document_id_unique UNIQUE (raw_document_id);
