-- CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_pulse_wip_appointments` AS
WITH total_appointments AS (
  SELECT job_id, start, status
    FROM `shape-mhs-1.servicetitan_shape_mhs_1.appointment` 
   WHERE status NOT IN ('Canceled', 'Done')
), 
past_appointments AS (
  SELECT job_id
       , MIN(start) AS first_past_appointment  
       , COALESCE(COUNT(*),0) AS total_past_appointments
       , MAX(start) AS last_past_appointment
    FROM total_appointments ta
   WHERE DATE(start) < CURRENT_DATE()
   GROUP BY job_id       
), 
future_appointments AS (
  SELECT job_id
       , start  
       , ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY start ASC) AS rn
    FROM total_appointments ta
   WHERE DATE(start) >= CURRENT_DATE()
), 
next_appointments AS (
  SELECT fa.job_id
       , COUNT(*) AS total_future_appointments  
       , MAX(CASE WHEN rn = 1 THEN start END) AS start_appointment
       , MAX(CASE WHEN rn = 2 THEN start END) AS next_appointment
    FROM future_appointments fa
   WHERE rn <= 2  
   GROUP BY fa.job_id
)
SELECT COALESCE(p.job_id, n.job_id)                                                       AS job_id
     , p.first_past_appointment                                                           AS first_appointment
     , COALESCE(p.total_past_appointments, 0) + COALESCE(n.total_future_appointments, 0)  AS total_appointments
     , CASE 
         WHEN n.start_appointment IS NOT NULL THEN n.start_appointment
         ELSE p.last_past_appointment
       END                                                                                AS start_appointment
     , CASE 
         WHEN n.next_appointment IS NOT NULL THEN n.next_appointment
         ELSE COALESCE(p.last_past_appointment, n.start_appointment)
       END                                                                                AS next_appointment
     , p.last_past_appointment                                                            AS most_recent_appointment 
  FROM past_appointments p
  FULL OUTER JOIN next_appointments n ON p.job_id = n.job_id
  ORDER BY COALESCE(p.job_id, n.job_id)  
