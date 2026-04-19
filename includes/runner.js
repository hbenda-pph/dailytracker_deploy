// includes/runner.js
const companies = require("./companies.js");

module.exports = (templateMacro) => {
    companies.forEach(item => {
        templateMacro(item.id, item.project_id, item.raw_dataset);
    });
};
