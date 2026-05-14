-- ============================================================
-- VIEW: vw_job_technicians
-- PURPOSE: Canonical source of Assigned Technicians and Primary Technician per Job.
--          Shared across DailyTracker, PULSE, LTM and future dashboards.
--
-- OUTPUTS (keyed by job_id):
--   job_id               → join key for any dashboard query
--   assigned_technicians → comma-separated list (from appointment_assignment)
--   primary_technician   → resolved PT using CASE logic below
--
-- LOGIC:
--   Primary source : appointment_assignment (ordered by assigned_on ASC)
--   Override rule  : if PT from appointment has split < MAX split of job
--                    → use tech with highest split from job_split (DESC)
--   Tiebreaker     : when splits are equal, appointment order wins
--
-- STATUS: v1.0
-- ============================================================

CREATE OR REPLACE VIEW `{project}.dashboards.vw_job_technicians`                                    AS

WITH

-- Step A: job_split enriched
--   → PT with highest split (DESC), tiebreaker: created_on ASC
--   → max_split of the job (to compare against appointment PT's split)
ts AS (
    SELECT js.job_id                                                                                AS job_id
         , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                             AS assigned_technicians_split
         , ARRAY_AGG(TRIM(IFNULL(t.name, ''))
               ORDER BY js.split DESC, js.created_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS pt_split_desc
         , MAX(js.split)                                                                            AS max_split
      FROM `{project}.{rawDataset}.job_split`                                                       js
      LEFT JOIN `{project}.bronze.technician`                                                       t
        ON js.technician_id                                                                         = t.id
     GROUP BY js.job_id
),

-- Step B: appointment_assignment enriched
--   → all assigned technicians (distinct)
--   → PT = first technician by assigned_on ASC
--   → pt_appt_split = split of that PT (to evaluate against max_split)
ta AS (
    SELECT aa.job_id                                                                                AS job_id
         , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                             AS assigned_technicians2
         , ARRAY_AGG(TRIM(IFNULL(t.name, ''))
               ORDER BY aa.assigned_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS primary_technician2
         , ARRAY_AGG(js_appt.split
               ORDER BY aa.assigned_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS pt_appt_split
      FROM `{project}.silver.vw_appointment_assignment`                                             aa
      LEFT JOIN `{project}.dashboards.vw_dailytracker_technicians_employees`                        t
        ON aa.technician_id                                                                         = t.id
      LEFT JOIN `{project}.{rawDataset}.job_split`                                                  js_appt
        ON js_appt.job_id                                                                           = aa.job_id
       AND js_appt.technician_id                                                                    = aa.technician_id
     WHERE aa.active
     GROUP BY aa.job_id
)

SELECT COALESCE(ts.job_id, ta.job_id)                                                               AS job_id
     -- Assigned Technicians: prefer appointment source (more complete), fallback to split
     , ARRAY_TO_STRING(COALESCE(ta.assigned_technicians2, ts.assigned_technicians_split, []), ', ') AS assigned_technicians
     -- Primary Technician: CASE logic
     , CASE
           WHEN ta.primary_technician2 IS NULL
               THEN ts.pt_split_desc             -- No appointment record → use split
           WHEN ta.pt_appt_split >= ts.max_split
               THEN TRIM(ta.primary_technician2) -- Appointment PT has the highest split → correct
           ELSE TRIM(ts.pt_split_desc)           -- Another tech has higher split → override
       END                                                                                          AS primary_technician
  FROM ta
  FULL OUTER JOIN ts
    ON ta.job_id                                                                                    = ts.job_id
;