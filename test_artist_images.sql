-- Test query to check if artists have image_url
SELECT name, image_url, 
       CASE WHEN image_url IS NULL THEN 'NO IMAGE' ELSE 'HAS IMAGE' END as image_status
FROM artists 
WHERE name ILIKE '%goose%'
LIMIT 10;
