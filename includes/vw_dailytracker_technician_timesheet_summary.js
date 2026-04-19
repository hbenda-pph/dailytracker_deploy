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
  WITH raw_data AS (
    SELECT * FROM \`${projectId}.dashboards.vw_dailytracker_timestamp_base\` 
  ),
  job_records AS (
    -- Add row numbers and calculate effective end time (Proxy for unended jobs)
    -- Rule: If no end_ts, use next_job_start - 1min IF the gap is under 60 mins
    SELECT *
         , DATE(start_ts) AS work_date
         , ROW_NUMBER() OVER (PARTITION BY emp_id, DATE(start_ts) ORDER BY start_ts) AS job_seq
         , LEAD(start_ts) OVER (PARTITION BY emp_id, DATE(start_ts) ORDER BY start_ts) AS next_job_start
         , COALESCE(end_ts, 
                   IF(LEAD(start_ts) OVER (PARTITION BY emp_id, DATE(start_ts) ORDER BY start_ts) > arrival_ts 
                      AND TIMESTAMP_DIFF(LEAD(start_ts) OVER (PARTITION BY emp_id, DATE(start_ts) ORDER BY start_ts), arrival_ts, MINUTE) < 60,
                      TIMESTAMP_SUB(LEAD(start_ts) OVER (PARTITION BY emp_id, DATE(start_ts) ORDER BY start_ts), INTERVAL 1 MINUTE), 
                      arrival_ts)) AS effective_end_ts
      FROM raw_data
     WHERE source = 'Job'
  ),
  first_arrival_logic AS (
    -- Get key timestamps for Start and First_Arrival columns
    -- Differentiates between 'threshold' (ANY arrival) and 'column' (non-zero duration jobs)
    SELECT ts.emp_id
         , ts.emp_name
         , ts.work_date
         -- For FIRST_ARRIVAL_TIME column: 
         -- Employees = Clock-In, Technicians = Min arrival of jobs with duration > 0 OR explicit end_ts
         , CASE 
            WHEN MAX(CASE WHEN ts.emp_type = 'Technician' THEN 1 ELSE 0 END) = 1 
            THEN MIN(CASE WHEN ts.source = 'Job' AND (ts.end_ts IS NOT NULL OR ts.effective_end_ts > ts.arrival_ts) THEN ts.arrival_ts ELSE NULL END)
            ELSE MIN(CASE WHEN ts.source = 'Non-Job' AND ts.code = 'ClockIO' THEN ts.start_ts ELSE NULL END)
           END AS first_arrival_column
         -- For identifying paid threshold: First valid arrival of the day (includes duration 0)
         , MIN(CASE WHEN ts.source = 'Job' AND (ts.end_ts IS NOT NULL OR ts.next_job_start IS NOT NULL) THEN ts.arrival_ts ELSE NULL END) AS first_arrival_threshold
      FROM (
        -- Technicians use job_records (to get effective_end_ts and next_job_start), Employees use raw_data
        SELECT emp_id, emp_name, emp_type, work_date, source, start_ts, arrival_ts, end_ts, effective_end_ts, next_job_start, code
          FROM job_records
         UNION ALL
        SELECT emp_id, emp_name, emp_type, DATE(start_ts) as work_date, source, start_ts, arrival_ts, end_ts, end_ts as effective_end_ts, NULL as next_job_start, code
          FROM raw_data
         WHERE source = 'Non-Job'
    ) ts
    GROUP BY ts.emp_id, ts.emp_name, ts.work_date
  ),
  job_sequences AS (
    -- Identify arrival times for Job 1 and Job 2 to determine if Job 1 driving is paid
    SELECT emp_id
         , work_date
         , MIN(CASE WHEN job_seq = 1 THEN start_ts ELSE NULL END) AS job1_start
         , MIN(CASE WHEN job_seq = 1 THEN arrival_ts ELSE NULL END) AS job1_arrival
         , MIN(CASE WHEN job_seq = 2 THEN arrival_ts ELSE NULL END) AS job2_arrival
      FROM job_records
    GROUP BY emp_id, work_date
  ),
  unpaid_breaks AS (
    -- Pre-aggregate all same-day Unpaid Non-Job segments with a valid end_ts.
    -- DATE(start_ts) = DATE(arrival_ts) previene contaminación cross-day.
    SELECT emp_id
         , DATE(start_ts) AS work_date
         , start_ts
         , end_ts
      FROM raw_data
     WHERE source         = 'Non-Job'
       AND type           = 'Unpaid'
       AND end_ts         IS NOT NULL
       AND DATE(start_ts) = DATE(arrival_ts)
  ),
  break_overlaps_per_job AS (
    -- Para cada segmento de job, calcula el overlap de breaks en 3 ventanas de tiempo.
    -- Reemplaza 3 correlated subqueries en paid_driving, job_hours y paid_idle.
    --   · driving : job.start_ts        → job.arrival_ts
    --   · on_job  : job.arrival_ts      → job.effective_end_ts
    --   · idle    : job.effective_end_ts → job.next_job_start
    SELECT jr.emp_id
         , jr.work_date
         , jr.start_ts         AS job_start
         , jr.arrival_ts       AS job_arrival
         , jr.effective_end_ts
         , jr.next_job_start
         , SUM(CASE
            WHEN ub.start_ts < jr.arrival_ts AND ub.end_ts > jr.start_ts
            THEN CAST(ROUND(TIMESTAMP_DIFF(LEAST(ub.end_ts, jr.arrival_ts), GREATEST(ub.start_ts, jr.start_ts), SECOND) / 60.0) AS INT64) * 60
            ELSE 0
           END) AS driving_break_seconds
         , SUM(CASE
            WHEN ub.start_ts < jr.effective_end_ts AND ub.end_ts > jr.arrival_ts
            THEN CAST(ROUND(TIMESTAMP_DIFF(LEAST(ub.end_ts, jr.effective_end_ts), GREATEST(ub.start_ts, jr.arrival_ts), SECOND) / 60.0) AS INT64) * 60
            ELSE 0
           END) AS job_break_seconds
         , SUM(CASE
            WHEN jr.next_job_start IS NOT NULL
              AND ub.start_ts < jr.next_job_start AND ub.end_ts > jr.effective_end_ts
          THEN CAST(ROUND(TIMESTAMP_DIFF(LEAST(ub.end_ts, jr.next_job_start), GREATEST(ub.start_ts, jr.effective_end_ts), SECOND) / 60.0) AS INT64) * 60
          ELSE 0
        END) AS idle_break_seconds
    FROM job_records jr
    LEFT JOIN unpaid_breaks ub
      ON  ub.emp_id    = jr.emp_id
     AND ub.work_date = jr.work_date
   GROUP BY jr.emp_id, jr.work_date, jr.start_ts, jr.arrival_ts, jr.effective_end_ts, jr.next_job_start
  ),
  paid_driving AS (
    -- Calculate driving time (arrival - start) for all paid jobs
    -- Precision: Subtract pre-computed break overlap (break_overlaps_per_job)
    SELECT jr.emp_id
         , jr.emp_name
         , jr.work_date
         , SUM(
            TIMESTAMP_DIFF(jr.arrival_ts, jr.start_ts, SECOND) -
            COALESCE(bop.driving_break_seconds, 0)
           ) AS driving_seconds
      FROM job_records jr
      JOIN first_arrival_logic fal ON jr.emp_id = fal.emp_id AND jr.work_date = fal.work_date
      LEFT JOIN job_sequences   js  ON jr.emp_id = js.emp_id  AND jr.work_date = js.work_date
      LEFT JOIN break_overlaps_per_job bop
        ON  bop.emp_id     = jr.emp_id
       AND bop.work_date  = jr.work_date
       AND bop.job_start  = jr.start_ts
       AND bop.job_arrival = jr.arrival_ts
     WHERE jr.arrival_ts IS NOT NULL
      -- Exclude Job 1 driving ONLY if it's an unpaid commute
      -- Rule: Unpaid if it started AFTER 7:30 AM AND it is the threshold arrival
       AND NOT (jr.job_seq = 1
                AND EXTRACT(HOUR FROM js.job1_start) * 100 + EXTRACT(MINUTE FROM js.job1_start) > 730
                AND fal.first_arrival_threshold = js.job1_arrival
               )
     GROUP BY jr.emp_id, jr.emp_name, jr.work_date
  ),
  clock_times AS (
    -- Get clock in/out times
    SELECT emp_id
         , emp_name
         , emp_type
         , DATE(start_ts) AS work_date
         , MIN(start_ts) AS clock_in
         , MAX(end_ts) AS clock_out
      FROM raw_data
     WHERE source = 'Non-Job'
      AND code = 'ClockIO'
     GROUP BY emp_id, emp_name, emp_type, DATE(start_ts)
  ),
  job_hours AS (
    -- Calculate actual job working time
    -- Rule: Subtract only the portion of unpaid breaks that overlaps with job segments
    SELECT emp_id
         , emp_name
         , work_date
         , SUM(net_seconds) AS net_job_seconds
      FROM (
        -- For Technicians: Segments are (arrival_ts to effective_end_ts)
        SELECT jr.emp_id
             , jr.emp_name
             , jr.work_date
             , TIMESTAMP_DIFF(jr.effective_end_ts, jr.arrival_ts, SECOND) -
               COALESCE(bop.job_break_seconds, 0) AS net_seconds
        FROM job_records jr
        LEFT JOIN break_overlaps_per_job bop
          ON  bop.emp_id      = jr.emp_id
         AND bop.work_date   = jr.work_date
         AND bop.job_start   = jr.start_ts
         AND bop.job_arrival = jr.arrival_ts
       UNION ALL
        -- For Employees: Segment is the entire ClockIO range
      SELECT ct.emp_id
           , ct.emp_name
           , ct.work_date
           , TIMESTAMP_DIFF(ct.clock_out, ct.clock_in, SECOND) - 
             COALESCE((
               SELECT SUM(TIMESTAMP_DIFF(ub.end_ts, ub.start_ts, SECOND))
                 FROM raw_data ub
                WHERE ub.emp_id = ct.emp_id
                  AND ub.source = 'Non-Job'
                  AND ub.type = 'Unpaid'
                  AND ub.end_ts IS NOT NULL
                  AND DATE(ub.start_ts) = ct.work_date
                  -- Rule: Only same-day modifications
                  AND DATE(ub.start_ts) = DATE(ub.arrival_ts)
              ), 0) AS net_seconds
        FROM clock_times ct
       WHERE ct.emp_type = 'Employee'
         AND NOT EXISTS (
            SELECT 1 FROM job_records jr 
            WHERE jr.emp_id = ct.emp_id 
              AND jr.work_date = ct.work_date
          )
    )
    GROUP BY emp_id, emp_name, work_date
  ),
  paid_idle AS (
    -- Calculate idle time between consecutive jobs
    -- Precision: Uses effective_end_ts (proxy) and rounds break segments
    SELECT jr.emp_id
         , jr.emp_name
         , jr.work_date
         , SUM(
            TIMESTAMP_DIFF(jr.next_job_start, jr.effective_end_ts, SECOND) -
            COALESCE(bop.idle_break_seconds, 0)
           ) AS idle_seconds
      FROM job_records jr
      LEFT JOIN break_overlaps_per_job bop
        ON  bop.emp_id      = jr.emp_id
       AND bop.work_date   = jr.work_date
       AND bop.job_start   = jr.start_ts
       AND bop.job_arrival = jr.arrival_ts
     WHERE jr.next_job_start IS NOT NULL
       AND jr.next_job_start > jr.effective_end_ts
     GROUP BY jr.emp_id, jr.emp_name, jr.work_date
  ),
  all_timesheet_codes AS (
    -- Get the full list of active codes categorized by type
    SELECT DISTINCT code, type
      FROM \`${projectId}.silver.vw_timesheet_code\`
     WHERE active = TRUE
       AND UPPER(TRIM(type)) IN ('CLOCKINOUT', 'PAID', 'PAIDTIMEOFF', 'UNPAID')
  ),
  timesheet_code_durations AS (
    -- Sum duration for codes that actually exist in raw_data
    SELECT emp_id
         , DATE(start_ts) AS work_date
         , code
         , SUM(TIMESTAMP_DIFF(end_ts, start_ts, SECOND)) AS seconds
      FROM raw_data
     WHERE source = 'Non-Job'
       AND end_ts IS NOT NULL
       AND code NOT IN ('ClockIO')
     GROUP BY emp_id, work_date, code
  ),
  timesheets_codes_agg AS (
    -- Cross-join employees/dates with all possible codes to ensure 0h 00m entries appear across 4 categories
    SELECT ct.emp_id
         , ct.work_date
         , STRING_AGG(
           CASE WHEN UPPER(TRIM(atc.type)) = 'CLOCKINOUT' THEN
            CONCAT(atc.code, ': ', 
                   CAST(FLOOR(COALESCE(tcd.seconds, 0) / 3600) AS STRING), 'h ', 
                   LPAD(CAST(FLOOR(MOD(CAST(COALESCE(tcd.seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm')
           END,
           ' | '
           ORDER BY atc.code
           ) AS codes_clockinout
         , STRING_AGG(
           CASE WHEN UPPER(TRIM(atc.type)) = 'PAID' THEN
            CONCAT(atc.code, ': ', 
                   CAST(FLOOR(COALESCE(tcd.seconds, 0) / 3600) AS STRING), 'h ', 
                   LPAD(CAST(FLOOR(MOD(CAST(COALESCE(tcd.seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm')
           END,
           ' | '
           ORDER BY atc.code
           ) AS codes_paid
         , STRING_AGG(
            CASE WHEN UPPER(TRIM(atc.type)) = 'PAIDTIMEOFF' THEN
            CONCAT(atc.code, ': ', 
                   CAST(FLOOR(COALESCE(tcd.seconds, 0) / 3600) AS STRING), 'h ', 
                   LPAD(CAST(FLOOR(MOD(CAST(COALESCE(tcd.seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm')
            END,
            ' | '
            ORDER BY atc.code
            ) AS codes_paidtimeoff           
         , STRING_AGG(
            CASE WHEN UPPER(TRIM(atc.type)) = 'UNPAID' THEN
            CONCAT(atc.code, ': ', 
                   CAST(FLOOR(COALESCE(tcd.seconds, 0) / 3600) AS STRING), 'h ', 
                   LPAD(CAST(FLOOR(MOD(CAST(COALESCE(tcd.seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm')
            END,
            ' | '
            ORDER BY atc.code
            ) AS codes_unpaid
         , SUM(CASE WHEN UPPER(TRIM(atc.type)) IN ('PAID', 'PAIDTIMEOFF') THEN COALESCE(tcd.seconds, 0) ELSE 0 END) AS total_paid_to_seconds
    FROM clock_times ct
   CROSS JOIN all_timesheet_codes atc
    LEFT JOIN timesheet_code_durations tcd
      ON ct.emp_id = tcd.emp_id 
     AND ct.work_date = tcd.work_date
     AND atc.code = tcd.code
   GROUP BY ct.emp_id, ct.work_date
  ),
  unpaid_time_off AS (
    -- Sum of Unpaid codes (excluding Meal) for compatibility
    SELECT emp_id
         , DATE(start_ts) AS work_date
         , SUM(TIMESTAMP_DIFF(end_ts, start_ts, SECOND)) AS unpaid_to_seconds
      FROM raw_data
     WHERE source = 'Non-Job'
       AND end_ts IS NOT NULL
       AND code NOT IN ('ClockIO', 'Meal')
       AND UPPER(TRIM(type)) = 'UNPAID'
       AND DATE(start_ts) = DATE(arrival_ts)
     GROUP BY emp_id, work_date
  )
-- ============================================================================
-- FINAL OUTPUT
-- ============================================================================
SELECT ct.emp_id                                                                                                   AS \`Employee Id\`
     , ct.emp_name                                                                                                 AS \`Employee\`
     , ct.work_date                                                                                                AS \`Date\`
     , CASE 
         WHEN ct.emp_type = 'Employee' THEN FORMAT_TIMESTAMP('%l:%M %p', ct.clock_in)
         WHEN fal.first_arrival_threshold IS NULL THEN NULL 
         -- Rule: Tech commute is PAID if it starts at or before 7:30 AM
         WHEN EXTRACT(HOUR FROM js.job1_start) * 100 + EXTRACT(MINUTE FROM js.job1_start) <= 730
              THEN FORMAT_TIMESTAMP('%l:%M %p', js.job1_start)
         -- OR if Job 1 was skipped (threshold is after Job 1 arrival)
         WHEN fal.first_arrival_threshold > js.job1_arrival 
              THEN FORMAT_TIMESTAMP('%l:%M %p', js.job1_start)
         -- Rule: Start always reflects when the technician began their day (job1_start)
         ELSE FORMAT_TIMESTAMP('%l:%M %p', js.job1_start)
       END                                                                                                         AS \`Start\`
     , FORMAT_TIMESTAMP('%l:%M %p', fal.first_arrival_column)                                                      AS \`First Arrival Time\`
     , FORMAT_TIMESTAMP('%l:%M %p', ct.clock_out)                                                                  AS \`End\`
     , CONCAT(CAST(FLOOR(COALESCE(pi.idle_seconds, 0) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(COALESCE(pi.idle_seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Paid Idle\`
     , CONCAT(CAST(FLOOR(COALESCE(pd.driving_seconds, 0) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(COALESCE(pd.driving_seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Paid Driving\`
     , CONCAT(CAST(FLOOR(COALESCE(jh.net_job_seconds, 0) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(COALESCE(jh.net_job_seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Job Hrs\`
     -- Categorized Timesheet Columns
     , COALESCE(ac.codes_clockinout, '-')                                                                          AS \`Timesheet Codes ClockInOut\`
     , COALESCE(ac.codes_paid, '-')                                                                                AS \`Timesheet Codes Paid\`
     , COALESCE(ac.codes_paidtimeoff, '-')                                                                         AS \`Timesheet Codes PaidTimeOff\`
     , COALESCE(ac.codes_unpaid, '-')                                                                              AS \`Timesheet Codes Unpaid\`
     , CONCAT(CAST(FLOOR(COALESCE(uto.unpaid_to_seconds, 0) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(COALESCE(uto.unpaid_to_seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Unpaid Time Off\`
     , CONCAT(CAST(FLOOR((COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST((COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Hours Worked\`
     -- Overtime Logic (California)
     , CONCAT(CAST(FLOOR(LEAST(COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0), 8 * 3600) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(LEAST(COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0), 8 * 3600) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Regular\`
     , CONCAT(CAST(FLOOR(CASE WHEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) > 12 * 3600 THEN 4 * 3600 WHEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) > 8 * 3600 THEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) - 8 * 3600 ELSE 0 END / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(CASE WHEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) > 12 * 3600 THEN 4 * 3600 WHEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) > 8 * 3600 THEN (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) - 8 * 3600 ELSE 0 END AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Overtime\`
     , CONCAT(CAST(FLOOR(GREATEST(0, (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) - 12 * 3600) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(GREATEST(0, (COALESCE(pi.idle_seconds, 0) + COALESCE(pd.driving_seconds, 0) + COALESCE(jh.net_job_seconds, 0)) - 12 * 3600) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Double OT\`
     -- Total PTO (Sum of all paid codes)
     , CONCAT(CAST(FLOOR(COALESCE(ac.total_paid_to_seconds, 0) / 3600) AS STRING), 'h ', LPAD(CAST(FLOOR(MOD(CAST(COALESCE(ac.total_paid_to_seconds, 0) AS INT64), 3600) / 60) AS STRING), 2, '0'), 'm') AS \`Paid Time Off\`
     , ps.external_payroll_id                                                                                      AS \`Payroll ID\`
  FROM clock_times ct
  LEFT JOIN first_arrival_logic fal ON ct.emp_id = fal.emp_id AND ct.work_date = fal.work_date
  LEFT JOIN job_sequences js ON ct.emp_id = js.emp_id AND ct.work_date = js.work_date
  LEFT JOIN paid_idle pi ON ct.emp_id = pi.emp_id AND ct.work_date = pi.work_date
  LEFT JOIN paid_driving pd ON ct.emp_id = pd.emp_id AND ct.work_date = pd.work_date
  LEFT JOIN job_hours jh ON ct.emp_id = jh.emp_id AND ct.work_date = jh.work_date
  LEFT JOIN timesheets_codes_agg ac ON ct.emp_id = ac.emp_id AND ct.work_date = ac.work_date
  LEFT JOIN unpaid_time_off uto ON ct.emp_id = uto.emp_id AND ct.work_date = uto.work_date
  LEFT JOIN \`${projectId}.bronze.payroll_settings\` ps ON ct.emp_id = ps.employee_id
 WHERE EXTRACT(YEAR FROM ct.work_date) >= 2025
 ORDER BY ct.work_date, ct.emp_type DESC, ct.emp_name
  `);
