UPDATE "DayTypeOverride" SET "date" = "date" + interval '3 hours' WHERE EXTRACT(HOUR FROM "date") = 0;
UPDATE "AttendanceRecord" SET "timestamp" = DATE_TRUNC('day', "timestamp") + interval '3 hours' WHERE "type" LIKE 'STATUS_%' AND EXTRACT(HOUR FROM "timestamp") = 0;
