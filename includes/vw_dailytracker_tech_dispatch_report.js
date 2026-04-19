// includes/vw_dailytracker_tech_dispatch_report.js
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_dailytracker_tech_dispatch_report", {
    type: "view",
    database: projectId,
    schema: "dashboards",
    description: "View DAILYTRACKER TECH DISPATCH REPORT",
    tags: ["dashboards", "dailytracker", "vw_dailytracker_tech_dispatch_report"]
  })
    .query(`
  WITH dispatch_base AS (
    SELECT gpi.employee_id                                                                                
         , gpi.job_id                                                                                     
         , gpi.activity                                                                                   
         , gpi.started_on                                                                                 
         , gpi.ended_on                                                                                   
         , gpi.paid_time_type                                                                             
         , gpi.paid_duration_hours                                                                        
    FROM \`${projectId}.silver.vw_gross_pay_items\`                                                     gpi   
   WHERE gpi.activity                                                                                   IN ("Driving","Working")
  ),
  times_stg AS (
    SELECT db.*
         , \`pph-central.settings.fn_convert_utc_localtz\`(db.started_on, ${companyId})                   AS started_on_local
         , \`pph-central.settings.fn_convert_utc_localtz\`(db.ended_on, ${companyId})                     AS ended_on_local
      FROM dispatch_base                                                                                db
  ),
  dispatch_summary AS (
    SELECT ts.employee_id
         , ts.job_id
         , ts.activity
         , ts.paid_time_type
         , ts.paid_duration_hours
         , DATE(ts.started_on_local)                                                                    AS \`Timesheet Activity Date\`
         , TIME(ts.started_on_local)                                                                    AS \`Start Time\`
         , TIME(ts.ended_on_local)                                                                      AS \`End Time\`
         , CASE 
             WHEN ts.paid_time_type = 'Regular' THEN ROUND(CAST(ts.paid_duration_hours AS FLOAT64), 2)
             ELSE ROUND(0, 2)
           END                                                                                          AS \`Regular Time\`
         , CASE 
             WHEN ts.paid_time_type = 'Overtime' THEN ROUND(CAST(ts.paid_duration_hours AS FLOAT64), 2)
             ELSE ROUND(0, 2)
           END                                                                                          AS \`Overtime\`
         , ROUND(CAST(ts.paid_duration_hours AS FLOAT64), 2)                                            AS \`Duration Decimal\`
      FROM times_stg                                                                                    ts
  )
  SELECT TRIM(te.name)                                                                                  AS \`Name\`
       , ds.activity                                                                                    AS \`Timesheet Activity\`
       , ds.\`Timesheet Activity Date\`
       , j.job_number                                                                                   AS \`Job Number\`
       , ds.\`Start Time\`
       , ds.\`Regular Time\`
       , ds.\`End Time\`
       , i.id                                                                                           AS \`Invoice Number\`
       , TRIM(bu.name)                                                                                  AS \`Business Unit\`
       , CASE 
            WHEN ds.paid_time_type = 'Regular'         THEN ROUND(CAST(ps.hourly_rate AS FLOAT64),2)
            WHEN ds.paid_time_type = 'Overtime'        THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*1.5,2)
            WHEN ds.paid_time_type = 'DoubleOvertime'  THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*2,2)
            WHEN ds.paid_time_type = 'PaidTimeOff'     THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*0,2) 
            ELSE ROUND(CAST(ps.hourly_rate AS FLOAT64),2) 
         END                                                                                            AS \`Hourly Rate\`     
       , ds.\`Duration Decimal\`
       , ds.\`Overtime\`
    FROM dispatch_summary                                                                               ds
    LEFT JOIN \`${projectId}.${rawDataset}.job\`                                                        j
      ON j.id                                                                                           = ds.job_id
    LEFT JOIN \`${projectId}.${rawDataset}.invoice\`                                                    i
      ON i.job_id                                                                                       = j.id
    LEFT JOIN \`${projectId}.bronze.business_unit\`                                                     bu
      ON bu.id                                                                                          = j.business_unit_id
    LEFT JOIN \`${projectId}.dashboards.vw_dailytracker_technicians_employees\`                         te
      ON te.id                                                                                          = ds.employee_id    
    LEFT JOIN \`${projectId}.bronze.payroll_settings\`                                                  ps    
      ON ps.employee_id                                                                                 = te.id
   ORDER BY \`Timesheet Activity Date\`,\`Name\`,\`Start Time\`
  `);
