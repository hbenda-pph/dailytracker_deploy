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
SELECT name                                                                                                 AS \`Name\`
     , timesheet_activity                                                                                   AS \`Timesheet Activity\`
     , DATE(timesheet_activity_date)                                                                        AS \`Timesheet Activity Date\`
     , CAST(job_number AS STRING)                                                                           AS \`Job Number\`
     , SAFE.PARSE_TIME('%I:%M %p', REGEXP_REPLACE(start_time, r'[^0-9:a-zA-Z]', ' '))                       AS \`Start Time\`
     , ROUND(regular_time, 2)                                                                               AS \`Regular Time\`
     , SAFE.PARSE_TIME('%I:%M %p', REGEXP_REPLACE(end_time, r'[^0-9:a-zA-Z]', ' '))                         AS \`End Time\`
     , invoice_number                                                                                       AS \`Invoice Number\`
     , job_business_unit                                                                                    AS \`Business Unit\`
     , ROUND(hourly_rate,2)                                                                                 AS \`Hourly Rate\`     
     , ROUND(duration_dec, 2)                                                                               AS \`Duration Decimal\`
     , ROUND(overtime, 2)                                                                                   AS \`Overtime\`
  FROM \`\${projectId}.bronze.dailytracker_tech_dispatch_report\`
ORDER BY \`Timesheet Activity Date\`,\`Name\`,\`Start Time\`
`);