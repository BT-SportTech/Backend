-- Replace single sportsInstructor with sportsInstructors JSON array
ALTER TABLE "School" ADD COLUMN "sportsInstructors" JSONB;

UPDATE "School"
SET "sportsInstructors" = jsonb_build_array(
  jsonb_build_object('name', "sportsInstructor")
)
WHERE "sportsInstructor" IS NOT NULL
  AND btrim("sportsInstructor") <> '';

ALTER TABLE "School" DROP COLUMN "sportsInstructor";
