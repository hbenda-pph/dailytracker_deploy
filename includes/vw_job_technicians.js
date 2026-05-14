// includes/vw_job_technicians.js
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_job_technicians", {
    type: "view",
    database: projectId,
    schema: "dashboards",
    description: "Canonical source of Assigned Technicians and Primary Technician per Job. Shared across DailyTracker, PULSE, LTM and future dashboards.",
    tags: ["dashboards", "vw_job_technicians"]
  })
    .query(`
WITH

ts AS (
    SELECT js.job_id                                                                                AS job_id
         , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                             AS assigned_technicians_split
         , ARRAY_AGG(TRIM(IFNULL(t.name, ''))
               ORDER BY js.split DESC, js.created_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS pt_split_desc
         , MAX(js.split)                                                                            AS max_split
      FROM \`${projectId}.${rawDataset}.job_split\`                                                  js
      LEFT JOIN \`${projectId}.bronze.technician\`                                                   t
        ON js.technician_id                                                                         = t.id
     GROUP BY js.job_id
),

ta AS (
    SELECT aa.job_id                                                                                AS job_id
         , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                             AS assigned_technicians2
         , ARRAY_AGG(TRIM(IFNULL(t.name, ''))
               ORDER BY aa.assigned_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS primary_technician2
         , ARRAY_AGG(js_appt.split
               ORDER BY aa.assigned_on ASC
               LIMIT 1)[SAFE_OFFSET(0)]                                                             AS pt_appt_split
      FROM \`${projectId}.silver.vw_appointment_assignment\`                                         aa
      LEFT JOIN \`${projectId}.dashboards.vw_dailytracker_technicians_employees\`                   t
        ON aa.technician_id                                                                         = t.id
      LEFT JOIN \`${projectId}.${rawDataset}.job_split\`                                             js_appt
        ON js_appt.job_id                                                                           = aa.job_id
       AND js_appt.technician_id                                                                    = aa.technician_id
     WHERE aa.active
     GROUP BY aa.job_id
)

SELECT COALESCE(ts.job_id, ta.job_id)                                                               AS job_id
     , ARRAY_TO_STRING(COALESCE(ta.assigned_technicians2, ts.assigned_technicians_split, []), ', ') AS assigned_technicians
     , CASE
           WHEN ta.primary_technician2 IS NULL
               THEN ts.pt_split_desc
           WHEN ta.pt_appt_split >= ts.max_split
               THEN TRIM(ta.primary_technician2)
           ELSE TRIM(ts.pt_split_desc)
       END                                                                                          AS primary_technician
  FROM ta
  FULL OUTER JOIN ts
    ON ta.job_id                                                                                    = ts.job_id
  `);
