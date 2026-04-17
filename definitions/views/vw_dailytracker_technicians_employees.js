// definitions/views/vw_dailytracker_technicians_employees.js
// Recibe: companyId, projectId (destino), rawDataset (servicetitan_xxx)
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_dailytracker_technicians_employees")
    .type("view")
    .database(projectId)    // proyecto donde se crea la vista (company_project_id)
    .schema("dashboards")   // dataset destino fijo
    .description("View DAILYTRACKER TECHNICIANS EMPLOYEES")
    .tags(["dashboards", "dailytracker", "vw_dailytracker_technicians_employees"])
    .query(`
  SELECT 'Technician'        AS emp_type
        , id                 AS id
        , name               AS name
        , business_unit_id   AS business_unit_id
        , login_name         AS login_name
        , email              AS email
        , user_id            AS user_id
        , active             AS active
  --    , ARRAY_TO_STRING(ARRAY(SELECT CAST(x AS STRING) FROM UNNEST(role_ids) AS x),',') AS roles_ids
        , role_id            AS roles_ids
        , is_managed_tech    AS is_managed_tech
    FROM \`${projectId}.${rawDataset}.technician\`
  UNION ALL
  SELECT 'Employee'          AS emp_type
        , id                 AS id
        , name               AS name
        , business_unit_id   AS business_unit_id
        , login_name         AS login_name
        , email              AS email
        , user_id            AS user_id
        , active             AS active
        , role_id            AS roles_ids
        , NULL               AS is_managed_tech
    FROM \`${projectId}.${rawDataset}.employee\`
  `);
