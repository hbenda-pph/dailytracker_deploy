-- CREATE OR REPLACE VIEW `shape-mhs-1.dashboards.vw_dailytracker_technicians_employees` AS   
SELECT 'Technician'        AS emp_type
      , id                 AS id
      , name               AS name
      , business_unit_id   AS business_unit_id
      , login_name         AS login_name
      , email              AS email  
      , user_id            AS user_id 
      , active             AS active
--      , ARRAY_TO_STRING(ARRAY(SELECT CAST(x AS STRING) FROM UNNEST(role_ids) AS x),',') AS roles_ids             
      , role_id            AS roles_ids
      , is_managed_tech    AS is_managed_tech
--  FROM `shape-mhs-1.bronze.technician`
  FROM `shape-mhs-1.servicetitan_shape_mhs_1.technician`
  UNION ALL
SELECT 'Employee'         AS emp_type
      , id                 AS id
      , name               AS name
      , business_unit_id   AS business_unit_id
      , login_name         AS login_name
      , email              AS email  
      , user_id            AS user_id 
      , active             AS active
      , role_id            AS roles_ids
      , NULL               AS is_managed_tech             
  FROM `shape-mhs-1.servicetitan_shape_mhs_1.employee`
;