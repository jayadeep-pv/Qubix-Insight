using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Services.Domain
{
    public class DocumentService
    {
        private readonly IOrganizationService _service;

        public DocumentService(IOrganizationService service)
        {
            _service = service;
        }

        public List<Entity> LoadDocuments(Guid runId, Guid tenantRecordId)
        {
            var query = new QueryExpression("ilx_analysisdocument")
            {
                ColumnSet = new ColumnSet(
                    "ilx_name",
                    "ilx_documentname",
                    "ilx_extractedtext",
                    "ilx_analysis",
                    "ilx_blobpath"
                )
            };

            query.Criteria.AddCondition(
                "ilx_analysisrun",
                ConditionOperator.Equal,
                runId
            );

            TenantQueryHelper.AddTenantFilter(query, tenantRecordId.ToString());

            return _service.RetrieveMultiple(query).Entities.ToList();
        }
    }
}
