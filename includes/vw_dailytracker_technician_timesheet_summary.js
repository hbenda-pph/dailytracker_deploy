// includes/vw_dailytracker_technician_timesheet_summary.js
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_dailytracker_technician_timesheet_summary", {
    type: "view",
    database: projectId,
    schema: "dashboards",
    description: "View DAILYTRACKER TECHNICIAN TIMESHEET SUMMARY",
    tags: ["dashboards", "dailytracker", "vw_dailytracker_technician_timesheet_summary"]
  })
    .query(`
SELECT tts.employee_id        AS \`Employee Id\`
     , tts.employee           AS \`Employee\`
     , DATE(tts.date)         AS \`Date\`
     , SAFE.PARSE_TIME('%I:%M %p', REGEXP_REPLACE(tts.start, r'[^0-9:a-zA-Z]', ' ')) AS \`Start\`
     , SAFE.PARSE_TIME('%I:%M %p', REGEXP_REPLACE(tts.first_arrival_time, r'[^0-9:a-zA-Z]', ' ')) AS \`First Arrival Time\`
     , SAFE.PARSE_TIME('%I:%M %p', REGEXP_REPLACE(tts.end, r'[^0-9:a-zA-Z]', ' ')) AS \`End\`
     , tts.paid_idle          AS \`Paid Idle\`
     , tts.paid_driving       AS \`Paid Driving\`
     , tts.job_hrs            AS \`Job Hrs\`
     , COALESCE(NULLIF(ARRAY_TO_STRING(ARRAY(SELECT val FROM UNNEST([
         CONCAT('C643I/O: ', IFNULL(tts.c643i_o, '0h 00m')),
         CONCAT('C688I/O: ', IFNULL(tts.c688i_o, '0h 00m')),
         CONCAT('C1017I/O: ', IFNULL(tts.c1017i_o, '0h 00m')),
         CONCAT('C1244I/O: ', IFNULL(tts.c1244i_o, '0h 00m')),
         CONCAT('C31I/O: ', IFNULL(tts.c31i_o, '0h 00m')),
         CONCAT('C1360I/O: ', IFNULL(tts.c1360i_o, '0h 00m')),
         CONCAT('C657I/O: ', IFNULL(tts.c657i_o, '0h 00m'))
       ]) AS val WHERE val IS NOT NULL), ' | '), ''), '-') AS \`Timesheet Codes ClockInOut\`
       
     , COALESCE(NULLIF(ARRAY_TO_STRING(ARRAY(SELECT val FROM UNNEST([
         CONCAT('Manager Exception: ', IFNULL(tts.manager_exception, '0h 00m')),
         CONCAT('HR Orientation: ', IFNULL(tts.hr_orientation, '0h 00m'))
       ]) AS val WHERE val IS NOT NULL), ' | '), ''), '-') AS \`Timesheet Codes Paid\`

     , COALESCE(NULLIF(ARRAY_TO_STRING(ARRAY(SELECT val FROM UNNEST([
         CONCAT('Holiday: ', IFNULL(tts.holiday, '0h 00m')),
         CONCAT('Office Sick Time: ', IFNULL(tts.office_sick_time, '0h 00m')),
         CONCAT('Vacation: ', IFNULL(tts.vacation, '0h 00m')),
         CONCAT('PTO Office: ', IFNULL(tts.pto_office, '0h 00m'))
       ]) AS val WHERE val IS NOT NULL), ' | '), ''), '-') AS \`Timesheet Codes PaidTimeOff\`

     , COALESCE(NULLIF(ARRAY_TO_STRING(ARRAY(SELECT val FROM UNNEST([
         CONCAT('Temp C/O: ', IFNULL(tts.temp_c_o, '0h 00m')),
         CONCAT('Meal: ', IFNULL(tts.meal, '0h 00m')),
         CONCAT('Sick: ', IFNULL(tts.sick, '0h 00m')),
         CONCAT('Unavab: ', IFNULL(tts.unavab, '0h 00m')),
         CONCAT('EMS: ', IFNULL(tts.ems, '0h 00m')),
         CONCAT('Morning Meeting: ', IFNULL(tts.morning_meeting, '0h 00m'))
       ]) AS val WHERE val IS NOT NULL), ' | '), ''), '-') AS \`Timesheet Codes Unpaid\`
     , tts.unpaid_time_off    AS \`Unpaid Time Off\`
     , tts.hours_worked       AS \`Hours Worked\`
     , tts.regular            AS \`Regular\`
     , tts.overtime           AS \`Overtime\`
     , tts.double_ot          AS \`Double OT\`
     , tts.paid_time_off      AS \`Paid Time Off\`
     , tts.payroll_id         AS \`Payroll ID\`
  FROM \`\${projectId}.reports.technician_timesheet_summary\` tts
`);