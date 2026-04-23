-- CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_dailytracker_tech_dispatch_report` AS 
WITH dispatch_base AS (
SELECT TRIM(te.name)                                                                AS name
     , gpi.activity                                                                 AS activity
     , j.job_number                                                                 AS job_number
     , gpi.started_on                                                               AS started_on
     , gpi.paid_duration_hours                                                      AS paid_duration_hours 
     , gpi.ended_on                                                                 As ended_on
     , i.id                                                                         AS invoice_id
     , TRIM(bu.name)                                                                AS business_unit_name
     , ps.hourly_rate                                                               AS hourly_rate
     , gpi.paid_time_type                                                           AS paid_time_type
     , gpi.`date`                                                                   AS `date`
  FROM `shape-mhs-1.bronze.gross_pay_items`                                         gpi     
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.job`                              j
    ON j.id = gpi.job_id
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.invoice`                          i
    ON i.job_id = j.id
  LEFT JOIN `shape-mhs-1.bronze.business_unit`                                      bu
    ON bu.id = j.business_unit_id
  LEFT JOIN `shape-mhs-1.dashboards.vw_dailytracker_technicians_employees`              te
    ON te.id = gpi.employee_id    
  LEFT JOIN `shape-mhs-1.bronze.payroll_settings`                                   ps    
    ON ps.employee_id = te.id
 WHERE gpi.activity IN ("Driving","Working")
)
SELECT name                                                                                                       AS `Name`
     , activity                                                                                                   AS `Timesheet Activity`
     , DATE(`pph-central.settings.fn_univesalts_localtz`(`date`,1))                                               AS `Timesheet Activity Date`          
     , job_number                                                                                                 AS `Job Number`
     , TIME(`pph-central.settings.fn_univesalts_localtz`(started_on,1)) AS `Start Time`
     , CASE 
        WHEN paid_time_type = 'Regular' THEN ROUND(CAST(paid_duration_hours AS FLOAT64), 2)
        ELSE ROUND(0, 2)
       END                                                                                                        AS `Regular Time`
     , TIME(`pph-central.settings.fn_univesalts_localtz`(ended_on,1))    AS `End Time`
     , invoice_id                                                                                                 AS `Invoice Number`
     , business_unit_name                                                                                         AS `Business Unit`
     , CASE
        WHEN paid_time_type = 'Regular'         THEN ROUND(CAST(hourly_rate AS FLOAT64),2)
        WHEN paid_time_type = 'Overtime'        THEN ROUND(CAST(hourly_rate AS FLOAT64)*1.5,2)
        WHEN paid_time_type = 'DoubleOvertime'  THEN ROUND(CAST(hourly_rate AS FLOAT64)*2,2)
        WHEN paid_time_type = 'PaidTimeOff'     THEN ROUND(CAST(hourly_rate AS FLOAT64)*0,2) 
        ELSE ROUND(CAST(hourly_rate AS FLOAT64),2) 
       END                                                                                                        AS `Hourly Rate`     
     , ROUND(CAST(paid_duration_hours AS FLOAT64), 2)                                                             AS `Duration Decimal`
     , CASE 
        WHEN paid_time_type = 'Overtime' THEN ROUND(CAST(paid_duration_hours AS FLOAT64), 2)
        ELSE ROUND(0, 2)
       END                                                                                                        AS `Overtime`
 FROM dispatch_base
--WHERE EXTRACT(YEAR FROM `pph-central.settings.fn_univesalts_localtz`(`date`,1))                                   = 2026
ORDER BY `Timesheet Activity Date`,`Name`,`Start Time`
;

