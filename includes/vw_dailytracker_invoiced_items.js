// includes/vw_dailytracker_invoiced_items.js
module.exports = (companyId, projectId, rawDataset) =>
  publish("vw_dailytracker_invoiced_items", {
    type: "view",
    database: projectId,
    schema: "dashboards",
    description: "View DAILYTRACKER INVOICED ITEMS",
    tags: ["dashboards", "dailytracker", "vw_dailytracker_invoiced_items"]
  })
    .query(`
  SELECT j.job_number                                                                         AS \`Job #\`
       , j.job_number                                                                         AS \`Invoice #\`
       , TRIM(jt.name)                                                                        AS \`Job Type\`
       , DATE(\`pph-central\`.settings.fn_convert_utc_localtz(j.completed_on,${companyId}))   AS \`Completion Date\`
       , TRIM(ii.sku_name)                                                                    AS \`Item Code\`
       , TRIM(ii.display_name)                                                                AS \`Item Name\`
       , TRIM(ii.description)                                                                 AS \`Item Description\`
       , ROUND(ii.quantity,2)                                                                 AS \`Item Quantity\`
       , ROUND(ii.price,2)                                                                    AS \`Item Price\`
       , COALESCE(i.sub_total ,0)                                                             AS \`Invoice Subtotal\`
       , ROUND(i2.sold_hours,2)                                                               AS \`Sould Hours\`
    FROM \`${projectId}.${rawDataset}.job\`                                                   j 
    LEFT JOIN \`${projectId}.silver.vw_job_type\`                                             jt
      ON jt.id                                                                                = j.job_type_id
    LEFT JOIN \`${projectId}.${rawDataset}.invoice\`                                          i
      ON i.job_id                                                                             = j.id
    LEFT JOIN \`${projectId}.${rawDataset}.invoice_item\`                                     ii
      ON ii.invoice_id                                                                        = i.id  
    LEFT JOIN 
         (
          SELECT invoice.job_id                                                               AS job_id
               , SUM(invoice_items.sold_hours)                                                AS sold_hours  
            FROM \`${projectId}.${rawDataset}.invoice\`                                       invoice
            LEFT JOIN \`${projectId}.${rawDataset}.invoice_item\`                             invoice_items
              ON invoice_items.invoice_id                                                     = invoice.id
           WHERE invoice_items.active                                                         IS TRUE
           GROUP BY                                                                           invoice.job_id
         )                                                                                    i2
      ON i2.job_id                                                                            = j.id   
   WHERE ii.type                                                                              NOT IN ('Material','Equipment')    
     AND j.job_status                                                                         NOT IN ('Canceled')
     AND EXTRACT(YEAR FROM \`pph-central\`.settings.fn_convert_utc_localtz(j.completed_on,${companyId})) BETWEEN 2025 AND 2026
  ORDER BY j.completed_on
  `);
