-- Remove existing YouTube references without touching plans, accounts or history.
UPDATE catalog_exercises
SET payload = json_remove(json_set(payload, '$.videoUrl', ''), '$.videoTitle', '$.videoChannel')
WHERE lower(COALESCE(json_extract(payload, '$.videoUrl'), '')) LIKE '%youtube.com/%'
   OR lower(COALESCE(json_extract(payload, '$.videoUrl'), '')) LIKE '%youtu.be/%'
   OR lower(COALESCE(json_extract(payload, '$.videoUrl'), '')) LIKE '%youtube-nocookie.com/%';
--> statement-breakpoint
UPDATE catalog_exercises
SET payload = json_set(payload, '$.thumbnailUrl', '')
WHERE lower(COALESCE(json_extract(payload, '$.thumbnailUrl'), '')) LIKE '%ytimg.com/%'
   OR lower(COALESCE(json_extract(payload, '$.thumbnailUrl'), '')) LIKE '%ggpht.com/%';
--> statement-breakpoint
UPDATE catalog_exercises
SET payload = json_set(payload, '$.description', replace(json_extract(payload, '$.description'), 'Guarda il video dimostrativo per la posizione di partenza e il movimento. ', ''))
WHERE json_extract(payload, '$.description') LIKE 'Guarda il video dimostrativo per la posizione di partenza e il movimento.%';
