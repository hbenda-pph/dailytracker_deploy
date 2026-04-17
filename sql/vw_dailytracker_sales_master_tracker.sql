--CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_dailytracker_sales_master_tracker`              AS 
SELECT j.job_number                                                                                 AS `Job #`
     , TRIM(jt.name)                                                                                AS `Job Type`
     , TRIM(bu.name)                                                                                AS `Business Unit`
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(j.completed_on,1))                        AS `Completion Date`
     , p.number                                                                                     AS `Project`
     , COALESCE(it.total_invoice,0)                                                                 AS `Job Subtotal`
     , j.customer_id                                                                                AS `Customer Id`
     , TRIM(c.name)                                                                                 AS `Customer Name`
     , ARRAY_TO_STRING(IFNULL(ta.assigned_technicians2, []), ', ')                                  AS `Assigned Technicians`
     , TRIM(te.name)                                                                                AS `Sold By`
     , ROUND(ts.total_paid_time,2)                                                                  AS `Total Technicias Paid Time`     
     , TRIM(ta.primary_technician2)                                                                 AS `Primary Technician`     
     , j.job_status                                                                                 AS `Status`
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(ap.start_appointment,1))                  AS `Scheduled Date`
     , ap.total_appointments                                                                        AS `Total Appointments`     
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(ap.first_appointment,1))                  AS `First Appt Date`     
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(ap.first_appointment,1))                  AS `Last Appt Date`          
     , DATE(`pph-central.settings.fn_convert_utc_localtz`(ap.next_appointment,1))                   AS `Next Appt Start date`
     , TRIM(c.type)                                                                                 AS `Customer Type`
     , ROUND(COALESCE(es.subtotal,0),2)                                                             AS `Jobs Estimate Sales Subtotal`
     , ROUND(COALESCE(ei.estimate_items_total,0),2)                                                 AS `Jobs Estimate Sales Installed`
     , ap.total_appointments                                                                        AS `Appointments To Date`               
     , ROUND(COALESCE(el.sub_total_lead,0),2)                                                       AS `Sales from Leads Created`     
     , ARRAY_TO_STRING(IFNULL(jl.array_lead_created_string, []), ', ')                              AS `Lead Created`
     , j.id                                                                                         AS `Invoice #`
  FROM `shape-mhs-1.servicetitan_shape_mhs_1.job`                                                   j 
  LEFT JOIN `shape-mhs-1.silver.vw_job_type`                                                        jt
    ON jt.id                                                                                        = j.job_type_id
  LEFT JOIN
        (
         WITH jobs_lead_created AS (
         SELECT job_generated_lead_source_job_id AS job_generated_lead_source_job_id
              , COUNT(id) AS cant_job
              , ARRAY_AGG(id IGNORE NULLS) AS array_job               
              , ARRAY_AGG(job_generated_lead_source_employee_id IGNORE NULLS) AS array_job2                             
           FROM `shape-mhs-1.servicetitan_shape_mhs_1.job` jobs_lead
          GROUP BY jobs_lead.job_generated_lead_source_job_id
         ),
         jobs_lead_created_by AS (
           SELECT jlc.job_generated_lead_source_job_id
                , lead_created_id AS job_id
                , jobs_individual.id AS job_id_verificado
                , jobs_individual.job_generated_lead_source_employee_id AS employee_id
                , tl.name AS technician_name
            FROM jobs_lead_created jlc
            LEFT JOIN UNNEST(jlc.array_job) AS lead_created_id
            LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.job` jobs_individual 
              ON jobs_individual.id = lead_created_id
            LEFT JOIN `shape-mhs-1.bronze.technician` tl 
              ON tl.id = jobs_individual.job_generated_lead_source_employee_id
         )
         SELECT job_generated_lead_source_job_id                                                    AS job_generated_lead_source_job_id
              , ARRAY_AGG(job_id ORDER BY job_id)                                                   AS array_lead_created_integer
              , ARRAY_AGG(CAST(job_id AS STRING) ORDER BY job_id)                                   AS array_lead_created_string
              , ARRAY_AGG(DISTINCT TRIM(technician_name))                                           AS array_lead_created_by
           FROM jobs_lead_created_by
          GROUP BY job_generated_lead_source_job_id
        )                                                                                           jl
   ON jl.job_generated_lead_source_job_id                                                           = j.id 
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.business_unit`                                    bu
    ON bu.id                                                                                        = j.business_unit_id
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.project`                                          p
    ON p.id                                                                                         = j.project_id
  LEFT JOIN `shape-mhs-1.bronze.technician`                                                         t
    ON t.id                                                                                         = j.job_generated_lead_source_employee_id 
  LEFT JOIN 
       (
        SELECT invoice_lead.job_id                                                                  AS job_id
             , SUM(invoice_lead.sub_total)                                                          AS sub_total_lead
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.invoice`                                       invoice_lead
         GROUP BY invoice_lead.job_id
       )                                                                                            il
    ON il.job_id                                                                                    = j.job_generated_lead_source_job_id
  LEFT JOIN 
       (
        SELECT j_lead.job_generated_lead_source_job_id                                              AS parent_job_id
             , SUM(estimate.subtotal)                                                               AS sub_total_lead
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.estimate`                                      estimate
          JOIN `shape-mhs-1.servicetitan_shape_mhs_1.job`                                           j_lead
            ON j_lead.id                                                                            = estimate.job_id
         WHERE estimate.status_value                                                                = 1
           --AND estimate._fivetran_deleted                                                         = FALSE
           AND estimate.active
         GROUP BY j_lead.job_generated_lead_source_job_id
       )                                                                                            el
    ON el.parent_job_id                                                                             = j.id
  LEFT JOIN 
       (
        SELECT invoice_total.job_id                                                                 AS job_id
             , SUM(invoice_total.sub_total)                                                         AS total_invoice
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.invoice`                                       invoice_total
         GROUP BY invoice_total.job_id
       )                                                                                            it
    ON it.job_id                                                                                    = j.id  
  LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.customer`                                         c
    ON c.id                                                                                         = j.customer_id
  LEFT JOIN `shape-mhs-1.bronze.technician`                                                         te
    ON te.id                                                                                        = j.sold_by_id    
  LEFT JOIN 
       (
        SELECT js.job_id                                                                            AS job_id
             , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                          AS assigned_technicians
             , ARRAY_AGG(TRIM(IFNULL(t.name, '')) ORDER BY js.split,js.created_on DESC LIMIT 1)[SAFE_OFFSET(0)] AS primary_technician
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.job_split`                                     js
          LEFT JOIN `shape-mhs-1.bronze.technician`                                                 t 
            ON js.technician_id                                                                     = t.id
         GROUP BY                                                                                   js.job_id
       )                                                                                            ti 
    ON ti.job_id                                                                                    = j.id
  LEFT JOIN 
       (
        SELECT aa.job_id                                                                            AS job_id
             , ARRAY_AGG(DISTINCT TRIM(IFNULL(t.name, '')))                                         AS assigned_technicians2
             , ARRAY_AGG(TRIM(IFNULL(t.name, '')) ORDER BY aa.assigned_on LIMIT 1)[SAFE_OFFSET(0)]  AS primary_technician2
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.appointment_assignment`                        aa
          LEFT JOIN `shape-mhs-1.dashboards.vw_dailytracker_technicians_employees`                      t           
            ON aa.technician_id                                                                     = t.id
         WHERE aa.active   
         GROUP BY                                                                                   aa.job_id
       )                                                                                            ta 
    ON ta.job_id                                                                                    = j.id    
  LEFT JOIN 
       (
        SELECT job_id                                                                               AS job_id 
             , COUNT(estimate.id)                                                                   AS estimates
             , SUM(subtotal)                                                                        AS subtotal
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.estimate`                                      estimate
         WHERE sold_on                                                                              IS NOT NULL 
           AND active                                                                               IS TRUE
         GROUP BY                                                                                   job_id
       )                                                                                            es 
    ON es.job_id                                                                                    = j.id
  LEFT JOIN 
       (
        SELECT estimates.job_id                                                                     AS estimates_job_id
             , SUM(estimate_items.total)                                                            AS estimate_items_total        
          FROM `shape-mhs-1.servicetitan_shape_mhs_1.estimate`                                      estimates
          LEFT JOIN `shape-mhs-1.servicetitan_shape_mhs_1.estimate_item`                            estimate_items
            ON estimate_items.estimate_id                                                           = estimates.id
         WHERE estimates.active                                                                     IS TRUE
           AND estimates.status_value                                                               = 1                
         GROUP BY                                                                                   estimates.job_id
       )                                                                                            ei   
    ON ei.estimates_job_id                                                                          = j.id 
  LEFT JOIN `shape-mhs-1.bronze.campaign`                                                           ca
    ON ca.id                                                                                        = j.campaign_id
  LEFT JOIN 
       (
        SELECT jobs_timesheets.job_id                                                               AS job_id
             , SUM(DATETIME_DIFF(jobs_timesheets.done_on, jobs_timesheets.dispatched_on, MINUTE)/60) AS total_paid_time
          FROM `shape-mhs-1.bronze.timesheet`                                                       jobs_timesheets
         GROUP BY                                                                                   jobs_timesheets.job_id
       )                                                                                            ts      
    ON ts.job_id                                                                                    = j.id   
  LEFT JOIN 
       (
        SELECT job_id
             , SUM(total)                                                                           AS purchase_order_total
          FROM `shape-mhs-1.silver.vw_purchase_order`                                               purchase_orders
         GROUP BY                                                                                   purchase_orders.job_id
       )                                                                                            po   
    ON po.job_id                                                                                    = j.id
  LEFT JOIN 
       (
        SELECT job_id
             , SUM(return_amount)                                                                   AS returns_amount_total
          FROM `shape-mhs-1.silver.vw_return`                                                       returns
         GROUP BY                                                                                   returns.job_id
       )                                                                                            re   
    ON re.job_id                                                                                    = j.id
  LEFT JOIN `shape-mhs-1.silver.vw_pulse_wip_appointments`                                          ap
    ON ap.job_id                                                                                    = j.id    
 WHERE (EXTRACT(YEAR FROM `pph-central.settings.fn_convert_utc_localtz`(ap.first_appointment,1)) >= 2025
        OR
        EXTRACT(YEAR FROM `pph-central.settings.fn_convert_utc_localtz`(ap.start_appointment,1)) >= 2025
        OR
        EXTRACT(YEAR FROM `pph-central.settings.fn_convert_utc_localtz`(ap.next_appointment,1)) >= 2025
       ) 
--   AND j.id IN (500752358)
ORDER BY ap.first_appointment
;