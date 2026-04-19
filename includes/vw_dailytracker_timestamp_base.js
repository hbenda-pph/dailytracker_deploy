// includes/vw_dailytracker_timestamp_base.js
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_dailytracker_timestamp_base", {
    type: "view",
    database: projectId,
    schema: "dashboards",
    description: "View DAILYTRACKER TIMESTAMP BASE",
    tags: ["dashboards", "dailytracker", "vw_dailytracker_timestamp_base"]
  })
    .query(`
  WITH all_timesheets AS (
  SELECT id
       , technician_id                                          AS emp_id
       , 'Job'                                                  AS source
       , job_id                                                 AS job_id
       , \`pph-central.settings.fn_convert_utc_localtz\`(created_on, ${companyId})    AS created_on   
       , \`pph-central.settings.fn_convert_utc_localtz\`(dispatched_on, ${companyId}) AS start_ts
       , \`pph-central.settings.fn_convert_utc_localtz\`(arrived_on, ${companyId})    AS arrival_ts
       , \`pph-central.settings.fn_convert_utc_localtz\`(done_on, ${companyId})       AS end_ts
       , NULL                                                   AS timesheet_code_id
       , active     
    FROM \`${projectId}.${rawDataset}.timesheet\`
   WHERE active IS TRUE
   UNION ALL
  SELECT id
       , employee_id                                            AS emp_id
       , 'Non-Job'                                              AS source
       , NULL                                                   AS job_id
       , \`pph-central.settings.fn_convert_utc_localtz\`(created_on, ${companyId})    AS created_on     
       , \`pph-central.settings.fn_convert_utc_localtz\`(started_on, ${companyId})    AS start_ts
       , \`pph-central.settings.fn_convert_utc_localtz\`(created_on,  ${companyId})   AS arrival_ts
       , \`pph-central.settings.fn_convert_utc_localtz\`(ended_on, ${companyId})      AS end_ts
       , timesheet_code_id                                      AS timesheet_code_id     
       , active     
    FROM \`${projectId}.bronze.non_job_timesheets\`
   WHERE active IS TRUE 
  )
  SELECT emp.name                                               AS emp_name
       , emp.emp_type                                           AS emp_type
       , emp.business_unit_id                                   AS business_unit_id
       , ts.*
       , tc.code
       , tc.description
       , tc.applicable_employee_type
       , tc.type
    FROM all_timesheets ts
    LEFT JOIN \`${projectId}.dashboards.vw_dailytracker_technicians_employees\` emp 
      ON ts.emp_id = emp.id
    LEFT JOIN \`${projectId}.silver.vw_timesheet_code\` tc
      ON tc.id = ts.timesheet_code_id
   ORDER BY ts.source, emp.name
  `);
