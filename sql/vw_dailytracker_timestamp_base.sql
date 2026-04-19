-- CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_dailytracker_timestamp_base` AS   
WITH all_timesheets AS (
SELECT id
     , technician_id                                          AS emp_id
     , 'Job'                                                  AS source
     , job_id                                                 AS job_id
     , `pph-central.fn_convert_utc_localtz`(created_on, 1)    AS created_on   
     , `pph-central.fn_convert_utc_localtz`(dispatched_on, 1) AS start_ts
     , `pph-central.fn_convert_utc_localtz`(arrived_on, 1)    AS arrival_ts
     , `pph-central.fn_convert_utc_localtz`(done_on, 1)       AS end_ts
     , NULL                                                   AS timesheet_code_id
     , active     
  FROM `shape-mhs-1.servicetitan_shape_mhs_1.timesheet`
 WHERE active IS TRUE
 UNION ALL
SELECT id
     , employee_id                                            AS emp_id
     , 'Non-Job'                                              AS source
     , NULL                                                   AS job_id
     , `pph-central.fn_convert_utc_localtz`(created_on, 1)    AS created_on     
     , `pph-central.fn_convert_utc_localtz`(started_on, 1)    AS start_ts
     , `pph-central.fn_convert_utc_localtz`(created_on,  1)   AS arrival_ts
     , `pph-central.fn_convert_utc_localtz`(ended_on, 1)      AS end_ts
     , timesheet_code_id                                      AS timesheet_code_id     
     , active     
  FROM `shape-mhs-1.bronze.non_job_timesheets`
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
  LEFT JOIN `shape-mhs-1.dashboards.vw_dailytracker_technicians_employees` emp 
    ON ts.emp_id = emp.id
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.timesheet_code` tc
    ON tc.id = ts.timesheet_code_id
 ORDER BY ts.source, emp.name
;