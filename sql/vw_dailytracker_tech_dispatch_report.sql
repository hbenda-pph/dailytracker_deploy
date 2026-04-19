-- CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_dailytracker_tech_dispatch_report`               AS 
SELECT TRIM(te.name)                                                                                  AS `Name`
     , gpi.activity                                                                                   AS `Timesheet Activity`
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(gpi.started_on, 1))                         AS `Timesheet Activity Date`
     , j.job_number                                                                                   AS `Job Number`
     , TIME(`pph-central.settings.fn_convert_utc_localtz`(gpi.started_on, 1))                         AS `Start Time`
     , CASE 
         WHEN gpi.paid_time_type = 'Regular' THEN ROUND(CAST(gpi.paid_duration_hours AS FLOAT64), 2)
         ELSE ROUND(0, 2)
       END                                                                                            AS `Regular Time`
     , TIME(`pph-central.settings.fn_convert_utc_localtz`(gpi.ended_on, 1))                           AS `End Time`
     , i.id                                                                                           AS `Invoice Number`
     , TRIM(bu.name)                                                                                  AS `Business Unit`
     , CASE 
          WHEN gpi.paid_time_type = 'Regular'         THEN ROUND(CAST(ps.hourly_rate AS FLOAT64),2)
          WHEN gpi.paid_time_type = 'Overtime'        THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*1.5,2)
          WHEN gpi.paid_time_type = 'DoubleOvertime'  THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*2,2)
          WHEN gpi.paid_time_type = 'PaidTimeOff'     THEN ROUND(CAST(ps.hourly_rate AS FLOAT64)*0,2) 
          ELSE ROUND(CAST(ps.hourly_rate AS FLOAT64),2) 
       END                                                                                            AS `Hourly Rate`     
     , ROUND(CAST(gpi.paid_duration_hours AS FLOAT64), 2)                                             AS `Duration Decimal`
     , CASE 
         WHEN gpi.paid_time_type = 'Overtime' THEN ROUND(CAST(gpi.paid_duration_hours AS FLOAT64), 2)
         ELSE ROUND(0, 2)
       END                                                                                            AS `Overtime`
  FROM `shape-mhs-1.silver.vw_gross_pay_items`                                                        gpi   
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.job`                                                j
    ON j.id                                                                                           = gpi.job_id
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.invoice`                                            i
    ON i.job_id                                                                                       = j.id
  LEFT JOIN `shape-mhs-1.bronze.business_unit`                                                        bu
    ON bu.id                                                                                          = j.business_unit_id
  LEFT JOIN `shape-mhs-1.dashboards.vw_dailytracker_technicians_employees`                            te
    ON te.id                                                                                          = gpi.employee_id    
  LEFT JOIN `shape-mhs-1.bronze.payroll_settings`                                                     ps    
    ON ps.employee_id                                                                                 = te.id
 WHERE gpi.activity                                                                                   IN ("Driving","Working")
 ORDER BY `Timesheet Activity Date`,`Name`,`Start Time`
;