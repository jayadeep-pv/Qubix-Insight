using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace QubixInsight.Services.Domain
{
    public class RunLoaderService
    {
        private readonly IOrganizationService _service;

        public RunLoaderService(IOrganizationService service)
        {
            _service = service;
        }

        public Entity LoadRun(Guid runId)
        {
            return _service.Retrieve(
                "ilx_analysisrun",
                runId,
                new ColumnSet(
                    "ilx_mode",
                    "ilx_aiinsightscope",
                    "ilx_documenttype",
                    "ilx_analysistemplate"
                )
            );
        }
    }
}
