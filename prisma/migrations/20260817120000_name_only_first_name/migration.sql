-- Store full name in firstName only; clear duplicate lastName values.
UPDATE "User"
SET "lastName" = ''
WHERE LOWER(TRIM("firstName")) = LOWER(TRIM("lastName"));
